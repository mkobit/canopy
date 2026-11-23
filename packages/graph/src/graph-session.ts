import type { Graph } from './graph';
import type { GraphEvent } from './events';
import type {
  GraphId,
  DeviceId,
  BatchId,
  NodeId,
  EdgeId,
  CommitSeq,
  PrincipalId,
  ActorId,
} from './identifiers';
import type { EventLogStore } from './event-log';
import type { Result } from './result';
import type { Instant } from './temporal';
import type { ActorKind, HlcClock, HlcTimestamp } from './hlc';
import { createHlcClock } from './hlc';
import { ok, err as error, unwrap } from './result';
import { mergeEvents, createMergeState, type MergeState } from './incremental-projection';
import { createGraph } from './create-graph';
import { getGraphSnapshotAt } from './history';
import { asActorId, asCommitSeq, asPrincipalId, createBatchId, ZERO_COMMIT_SEQ } from './factories';
import { validateBatch, type CommitError, type CommitSuccess } from './batch-validation';

export type { CommitError, CommitSuccess } from './batch-validation';

export interface GraphSessionDelta {
  readonly applied: readonly GraphEvent[];
}

export type GraphChangeHandler = (graph: Graph, delta: GraphSessionDelta) => unknown;

interface GraphChangeSubscription {
  readonly handler: GraphChangeHandler;
}

export interface CommitProvenance {
  readonly principalId?: PrincipalId | undefined;
  readonly actorId?: ActorId | undefined;
  readonly actorKind?: ActorKind | undefined;
  readonly deviceId?: DeviceId | undefined;
  readonly hlcTimestamp?: HlcTimestamp | undefined;
}

export type WritePrecondition =
  | Readonly<{ mode: 'unconditional' }>
  | Readonly<{
      mode: 'entity-cas';
      expectedEntitySeq: ReadonlyMap<NodeId | EdgeId, CommitSeq>;
    }>
  | Readonly<{ mode: 'graph-cas'; expectedGraphSeq: CommitSeq }>;

export interface CommitOptions {
  readonly provenance?: CommitProvenance | undefined;
  readonly precondition?: WritePrecondition | undefined;
}

export interface GraphSessionOptions {
  readonly principalId?: PrincipalId | undefined;
  readonly actorId?: ActorId | undefined;
  readonly actorKind?: ActorKind | undefined;
  readonly nowMs?: (() => number) | undefined;
  readonly maxDriftMs?: number | undefined;
}

export interface ReadConsistency {
  readonly minCommitSeq?: CommitSeq | undefined;
  readonly atCommitSeq?: CommitSeq | undefined;
  readonly atTimestamp?: Instant | undefined;
  readonly linearizable?: boolean | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface ReadGraphResult {
  readonly graph: Graph;
  readonly commitSeq: CommitSeq;
}

export type ReadConsistencyError =
  | Readonly<{
      kind: 'consistency-timeout';
      message: string;
      actualSeq: CommitSeq;
      requiredSeq: CommitSeq;
    }>
  | Readonly<{ kind: 'not-found'; message: string; requestedSeq: CommitSeq }>
  | Readonly<{ kind: 'validation'; message: string }>
  | Readonly<{ kind: 'resource-exhausted'; message: string }>
  | Readonly<{ kind: 'storage'; message: string; cause: Error }>;

export type GraphSession = Readonly<{
  load: () => Promise<Result<Graph, Error>>;
  commit: (
    events: readonly GraphEvent[],
    options?: CommitOptions,
  ) => Promise<Result<CommitSuccess, CommitError>>;
  graph: () => Graph;
  headCommitSeq: () => CommitSeq;
  entitySeqs: () => ReadonlyMap<NodeId | EdgeId, CommitSeq>;
  readGraph: (
    consistency?: ReadConsistency,
  ) => Promise<Result<ReadGraphResult, ReadConsistencyError>>;
  subscribe: (handler: GraphChangeHandler) => () => boolean;
}>;

const SESSION_GRAPH_NAME = 'graph';
const DEFAULT_PRINCIPAL_ID = asPrincipalId('principal:local');
const DEFAULT_READ_TIMEOUT_MS = 5000;
const MAX_PENDING_WAITERS = 1000;

type WaiterSettle = (result: Result<ReadGraphResult, ReadConsistencyError>) => boolean;

function resolveCommitBatchId(events: readonly GraphEvent[]): Result<BatchId, CommitError> {
  if (events.some((event) => (event.batchId as string | undefined) === '')) {
    return error({ kind: 'batch', message: 'Event batchId must not be empty' });
  }

  const distinctBatchIds = new Set(
    events.map((event) => event.batchId).filter((id): id is BatchId => id !== undefined),
  );
  if (distinctBatchIds.size > 1) {
    return error({
      kind: 'batch',
      message: 'All events in a commit must share a single batchId',
    });
  }

  const [firstBatchId] = distinctBatchIds;
  return ok(firstBatchId ?? createBatchId());
}

function checkWritePrecondition(
  precondition: WritePrecondition | undefined,
  headCommitSeq: CommitSeq,
  entitySeqs: ReadonlyMap<NodeId | EdgeId, CommitSeq>,
): Result<true, CommitError> {
  if (!precondition || precondition.mode === 'unconditional') {
    return ok(true);
  }

  if (precondition.mode === 'graph-cas') {
    if (precondition.expectedGraphSeq !== headCommitSeq) {
      return error({
        kind: 'concurrency-conflict',
        message: `Graph CAS mismatch: expected commitSeq ${precondition.expectedGraphSeq}, actual ${headCommitSeq}`,
        expectedSeq: precondition.expectedGraphSeq,
        actualSeq: headCommitSeq,
      });
    }
    return ok(true);
  }

  const mismatch = precondition.expectedEntitySeq
    .entries()
    .find(
      ([entityId, expectedSeq]) => (entitySeqs.get(entityId) ?? ZERO_COMMIT_SEQ) !== expectedSeq,
    );

  if (mismatch) {
    const [entityId, expectedSeq] = mismatch;
    const actualSeq = entitySeqs.get(entityId) ?? ZERO_COMMIT_SEQ;
    return error({
      kind: 'concurrency-conflict',
      message: `Entity CAS mismatch for ${entityId}: expected ${expectedSeq}, actual ${actualSeq}`,
      entityId,
      expectedSeq,
      actualSeq,
    });
  }

  return ok(true);
}

function advanceClockForCommit(
  clock: HlcClock,
  remoteHlc: HlcTimestamp | undefined,
): Result<HlcTimestamp, CommitError> {
  if (remoteHlc === undefined) {
    return ok(clock.tick());
  }
  const received = clock.receive(remoteHlc);
  return received.ok
    ? ok(received.value)
    : error({ kind: 'batch', message: received.error.message });
}

function dispatchChangeHandlers(
  handlers: readonly GraphChangeSubscription[],
  graph: Graph,
  delta: GraphSessionDelta,
): readonly unknown[] {
  return handlers.map((subscription) => subscription.handler(graph, delta));
}

function createSessionQueue(): <T>(operation: () => Promise<T>) => Promise<T> {
  const queueCell = { current: Promise.resolve() as Promise<unknown> };
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queueCell.current.catch(() => undefined).then(operation);
    queueCell.current = next.catch(() => undefined);
    return next;
  };
}

function checkImmediateReadGate(
  currentSeq: CommitSeq,
  graph: Graph,
  requiredSeq: CommitSeq,
  timeoutMs: number,
  waiterCount: number,
): Result<ReadGraphResult, ReadConsistencyError> | undefined {
  if (currentSeq >= requiredSeq) {
    return ok({ graph, commitSeq: currentSeq });
  }
  if (timeoutMs <= 0) {
    return error({
      kind: 'consistency-timeout',
      message: `Graph commitSeq ${currentSeq} has not reached minCommitSeq ${requiredSeq}`,
      actualSeq: currentSeq,
      requiredSeq,
    });
  }
  if (waiterCount >= MAX_PENDING_WAITERS) {
    return error({
      kind: 'resource-exhausted',
      message: `Exceeded maximum pending read waiters (${MAX_PENDING_WAITERS})`,
    });
  }
  return undefined;
}

function createWaiterRegistry(
  getHeadCommitSeq: () => CommitSeq,
  getGraph: () => Graph,
): Readonly<{
  resolveReady: (graph: Graph, headCommitSeq: CommitSeq) => boolean;
  waitForSeq: (
    requiredSeq: CommitSeq,
    timeoutMs: number,
  ) => Promise<Result<ReadGraphResult, ReadConsistencyError>>;
}> {
  const waiterSeqsCell = {
    current: new Map<number, CommitSeq>() as ReadonlyMap<number, CommitSeq>,
  };
  const waiterSettlesCell = {
    current: new Map<number, WaiterSettle>() as ReadonlyMap<number, WaiterSettle>,
  };
  const nextWaiterIdCell = { current: 1 };

  const removeWaiter = (waiterId: number): boolean => {
    waiterSeqsCell.current = new Map([...waiterSeqsCell.current].filter(([id]) => id !== waiterId));
    waiterSettlesCell.current = new Map(
      [...waiterSettlesCell.current].filter(([id]) => id !== waiterId),
    );
    return true;
  };

  const resolveReady = (graph: Graph, headCommitSeq: CommitSeq): boolean => {
    const readyIds = [...waiterSeqsCell.current]
      .filter(([, minSeq]) => headCommitSeq >= minSeq)
      .map(([id]) => id);
    return (
      readyIds.length > 0 &&
      readyIds
        .map((id) => waiterSettlesCell.current.get(id))
        .filter((settle): settle is WaiterSettle => settle !== undefined)
        .map((settle) => settle(ok({ graph, commitSeq: headCommitSeq }))).length > 0
    );
  };

  const waitForSeq = (
    requiredSeq: CommitSeq,
    timeoutMs: number,
  ): Promise<Result<ReadGraphResult, ReadConsistencyError>> => {
    const immediate = checkImmediateReadGate(
      getHeadCommitSeq(),
      getGraph(),
      requiredSeq,
      timeoutMs,
      waiterSeqsCell.current.size,
    );
    if (immediate) return Promise.resolve(immediate);

    return new Promise((resolve) => {
      const waiterId = nextWaiterIdCell.current;
      nextWaiterIdCell.current = waiterId + 1;
      const settledCell = { current: false };
      const timerCell = { current: undefined as ReturnType<typeof setTimeout> | undefined };

      const settle: WaiterSettle = (result) => {
        if (settledCell.current) return false;
        settledCell.current = true;
        if (timerCell.current !== undefined) clearTimeout(timerCell.current);
        removeWaiter(waiterId);
        resolve(result);
        return true;
      };

      timerCell.current = setTimeout(() => {
        const actualSeq = getHeadCommitSeq();
        return settle(
          error({
            kind: 'consistency-timeout',
            message: `Timed out waiting for commitSeq ${requiredSeq} (actual ${actualSeq})`,
            actualSeq,
            requiredSeq,
          }),
        );
      }, timeoutMs);

      waiterSeqsCell.current = new Map([...waiterSeqsCell.current, [waiterId, requiredSeq]]);
      waiterSettlesCell.current = new Map([...waiterSettlesCell.current, [waiterId, settle]]);
      return true;
    });
  };

  return { resolveReady, waitForSeq };
}

async function readSnapshotFromLog(
  eventLog: EventLogStore,
  graphId: GraphId,
  consistency: ReadConsistency,
  getHeadCommitSeq: () => CommitSeq,
  isLoaded: () => boolean,
  ensureLoaded: () => Promise<Result<Graph, Error>>,
): Promise<Result<ReadGraphResult, ReadConsistencyError>> {
  if (consistency.atCommitSeq !== undefined && consistency.atTimestamp !== undefined) {
    return error({
      kind: 'validation',
      message: 'atCommitSeq and atTimestamp are mutually exclusive',
    });
  }

  if (consistency.atCommitSeq !== undefined) {
    const requestedSeq = consistency.atCommitSeq;
    if (requestedSeq > getHeadCommitSeq() && !isLoaded()) {
      const loadResult = await ensureLoaded();
      if (!loadResult.ok) {
        return error({
          kind: 'storage',
          message: loadResult.error.message,
          cause: loadResult.error,
        });
      }
    }
    if (requestedSeq > getHeadCommitSeq()) {
      return error({
        kind: 'not-found',
        message: `No snapshot found at commitSeq ${requestedSeq}`,
        requestedSeq,
      });
    }
    const snapshot = await getGraphSnapshotAt(eventLog, graphId, { commitSeq: requestedSeq });
    return snapshot.ok
      ? ok(snapshot.value)
      : error({ kind: 'storage', message: snapshot.error.message, cause: snapshot.error });
  }

  const snapshot = await getGraphSnapshotAt(eventLog, graphId, {
    timestamp: consistency.atTimestamp as Instant,
  });
  return snapshot.ok
    ? ok(snapshot.value)
    : error({ kind: 'storage', message: snapshot.error.message, cause: snapshot.error });
}

function stampEventsForCommit(
  events: readonly GraphEvent[],
  defaults: Readonly<{
    deviceId: DeviceId;
    principalId: PrincipalId;
    actorId: ActorId;
    actorKind: ActorKind | undefined;
  }>,
  provenance: CommitProvenance | undefined,
  batchId: BatchId,
  commitSeq: CommitSeq,
  hlcTimestamp: HlcTimestamp,
): readonly GraphEvent[] {
  const effectiveActorKind = provenance?.actorKind ?? defaults.actorKind;
  return events.map(
    (event) =>
      ({
        ...event,
        deviceId: provenance?.deviceId ?? defaults.deviceId,
        batchId,
        hlcTimestamp,
        commitSeq,
        principalId: provenance?.principalId ?? defaults.principalId,
        actorId: provenance?.actorId ?? defaults.actorId,
        ...(effectiveActorKind !== undefined && { actorKind: effectiveActorKind }),
      }) as GraphEvent,
  );
}

interface SessionRuntimeContext {
  readonly eventLog: EventLogStore;
  readonly graphId: GraphId;
  readonly defaults: Readonly<{
    deviceId: DeviceId;
    principalId: PrincipalId;
    actorId: ActorId;
    actorKind: ActorKind | undefined;
  }>;
  readonly clock: HlcClock;
  readonly mergeStateCell: { current: MergeState };
  readonly currentGraphCell: { current: Graph };
  readonly loadedCell: { current: boolean };
  readonly subscribersCell: { current: ReadonlySet<GraphChangeSubscription> };
}

async function executeSessionCommit(
  context: SessionRuntimeContext,
  resolveReady: (graph: Graph, headCommitSeq: CommitSeq) => boolean,
  events: readonly GraphEvent[],
  commitOptions?: CommitOptions,
): Promise<Result<CommitSuccess, CommitError>> {
  const { mergeStateCell, currentGraphCell, loadedCell, subscribersCell } = context;
  const preconditionCheck = checkWritePrecondition(
    commitOptions?.precondition,
    mergeStateCell.current.headCommitSeq,
    mergeStateCell.current.entitySeqs,
  );
  if (!preconditionCheck.ok) return preconditionCheck;

  const hlcResult = advanceClockForCommit(context.clock, commitOptions?.provenance?.hlcTimestamp);
  if (!hlcResult.ok) return hlcResult;
  const hlcTimestamp = hlcResult.value;

  if (events.length === 0) {
    return ok({
      graph: currentGraphCell.current,
      batchId: createBatchId(),
      commitSeq: mergeStateCell.current.headCommitSeq,
      hlcTimestamp,
      events: [],
      warnings: [],
    });
  }

  const batchIdResult = resolveCommitBatchId(events);
  if (!batchIdResult.ok) return batchIdResult;
  const batchId = batchIdResult.value;
  const nextCommitSeq = asCommitSeq(mergeStateCell.current.headCommitSeq + 1);
  const stamped = stampEventsForCommit(
    events,
    context.defaults,
    commitOptions?.provenance,
    batchId,
    nextCommitSeq,
    hlcTimestamp,
  );

  const validation = validateBatch(currentGraphCell.current, stamped, batchId);
  if (!validation.ok) return validation;

  const appendResult = await context.eventLog.appendEvents(context.graphId, stamped);
  if (!appendResult.ok) {
    return error({
      kind: 'storage',
      message: appendResult.error.message,
      cause: appendResult.error,
    });
  }

  const merged = mergeEvents(mergeStateCell.current, currentGraphCell.current, stamped);
  mergeStateCell.current = merged.state;
  currentGraphCell.current = merged.graph;
  loadedCell.current = true;
  resolveReady(merged.graph, merged.state.headCommitSeq);
  if (merged.applied.length > 0) {
    dispatchChangeHandlers([...subscribersCell.current], merged.graph, { applied: merged.applied });
  }

  return ok({
    graph: merged.graph,
    batchId,
    commitSeq: nextCommitSeq,
    hlcTimestamp,
    events: stamped,
    warnings: validation.value,
  });
}

async function executeSessionRead(
  context: SessionRuntimeContext,
  waitForSeq: (
    requiredSeq: CommitSeq,
    timeoutMs: number,
  ) => Promise<Result<ReadGraphResult, ReadConsistencyError>>,
  load: () => Promise<Result<Graph, Error>>,
  fenceLinearizable: () => Promise<Result<Graph, Error>>,
  consistency?: ReadConsistency,
): Promise<Result<ReadGraphResult, ReadConsistencyError>> {
  const { mergeStateCell, currentGraphCell, loadedCell } = context;
  if (consistency?.atCommitSeq !== undefined || consistency?.atTimestamp !== undefined) {
    return readSnapshotFromLog(
      context.eventLog,
      context.graphId,
      consistency,
      () => mergeStateCell.current.headCommitSeq,
      () => loadedCell.current,
      load,
    );
  }
  if (consistency?.linearizable) {
    const fenced = await fenceLinearizable();
    if (!fenced.ok) {
      return error({ kind: 'storage', message: fenced.error.message, cause: fenced.error });
    }
  }
  if (consistency?.minCommitSeq !== undefined) {
    return waitForSeq(consistency.minCommitSeq, consistency.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS);
  }
  return ok({
    graph: currentGraphCell.current,
    commitSeq: mergeStateCell.current.headCommitSeq,
  });
}

/**
The single write path for a graph: op events flow through
CAS check -> provenance + HLC + commitSeq stamping -> validate -> EventLogStore append ->
incremental projection -> waiter resolution -> subscriber notification.
*/
export function createGraphSession(
  eventLog: EventLogStore,
  graphId: GraphId,
  deviceId: DeviceId,
  options?: GraphSessionOptions,
): GraphSession {
  const defaultActorId = options?.actorId ?? asActorId(deviceId);
  const clock = createHlcClock(defaultActorId, {
    nowMs: options?.nowMs,
    maxDriftMs: options?.maxDriftMs,
  });
  const mergeStateCell = { current: createMergeState() as MergeState };
  const currentGraphCell = { current: unwrap(createGraph(graphId, SESSION_GRAPH_NAME)) as Graph };
  const loadedCell = { current: false };
  const subscribersCell = {
    current: new Set<GraphChangeSubscription>() as ReadonlySet<GraphChangeSubscription>,
  };
  const enqueue = createSessionQueue();
  const waiters = createWaiterRegistry(
    () => mergeStateCell.current.headCommitSeq,
    () => currentGraphCell.current,
  );
  const runtimeContext: SessionRuntimeContext = {
    eventLog,
    graphId,
    defaults: {
      deviceId,
      principalId: options?.principalId ?? DEFAULT_PRINCIPAL_ID,
      actorId: defaultActorId,
      actorKind: options?.actorKind,
    },
    clock,
    mergeStateCell,
    currentGraphCell,
    loadedCell,
    subscribersCell,
  };

  const loadInternal = async (): Promise<Result<Graph, Error>> => {
    const initial = createGraph(graphId, SESSION_GRAPH_NAME);
    if (!initial.ok) return initial;
    const eventsResult = await eventLog.getEvents(graphId);
    if (!eventsResult.ok) return eventsResult;
    const merged = mergeEvents(createMergeState(), initial.value, eventsResult.value);
    mergeStateCell.current = merged.state;
    currentGraphCell.current = merged.graph;
    loadedCell.current = true;
    waiters.resolveReady(merged.graph, merged.state.headCommitSeq);
    return ok(merged.graph);
  };

  const load = (): Promise<Result<Graph, Error>> => enqueue(loadInternal);
  const fenceLinearizable = (): Promise<Result<Graph, Error>> =>
    enqueue(async () => (loadedCell.current ? ok(currentGraphCell.current) : loadInternal()));

  const subscribe = (handler: GraphChangeHandler): (() => boolean) => {
    const subscription: GraphChangeSubscription = { handler };
    subscribersCell.current = new Set([...subscribersCell.current, subscription]);
    return () => {
      if (!subscribersCell.current.has(subscription)) return false;
      subscribersCell.current = new Set(
        [...subscribersCell.current].filter((item) => item !== subscription),
      );
      return true;
    };
  };

  return {
    load,
    commit: (events, commitOptions) =>
      enqueue(() =>
        executeSessionCommit(runtimeContext, waiters.resolveReady, events, commitOptions),
      ),
    graph: () => currentGraphCell.current,
    headCommitSeq: () => mergeStateCell.current.headCommitSeq,
    entitySeqs: () => mergeStateCell.current.entitySeqs,
    readGraph: (consistency) =>
      executeSessionRead(runtimeContext, waiters.waitForSeq, load, fenceLinearizable, consistency),
    subscribe,
  };
}
