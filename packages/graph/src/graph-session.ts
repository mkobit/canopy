import type { Graph } from './graph';
import type { GraphEvent } from './events';
import type { GraphId, DeviceId, BatchId } from './identifiers';
import type { EventLogStore } from './event-log';
import type { Result } from './result';
import { ok, err as error, unwrap } from './result';
import { mergeEvents, createMergeState, type MergeState } from './incremental-projection';
import { createGraph } from './create-graph';
import { createBatchId } from './factories';
import { validateBatch, type CommitError, type CommitSuccess } from './batch-validation';

export type { CommitError, CommitSuccess } from './batch-validation';

export interface GraphSessionDelta {
  readonly applied: readonly GraphEvent[];
}

export type GraphChangeHandler = (graph: Graph, delta: GraphSessionDelta) => unknown;

interface GraphChangeSubscription {
  readonly handler: GraphChangeHandler;
}

export interface GraphSession {
  /**
  Reads the full event log and (re)projects it as the session's current graph.
  */
  readonly load: () => Promise<Result<Graph, Error>>;
  /**
  Validates, appends, and merges a set of events as one atomic commit.
  Events are stamped with the session's own deviceId and a single batchId.
  On validation failure, nothing is appended and the projected graph is unchanged.
  */
  readonly commit: (events: readonly GraphEvent[]) => Promise<Result<CommitSuccess, CommitError>>;
  /**
  The session's current projected graph (bootstrap-only if load() hasn't run yet).
  */
  readonly graph: () => Graph;
  readonly subscribe: (handler: GraphChangeHandler) => () => boolean;
}

const SESSION_GRAPH_NAME = 'graph';

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

/**
The single write path for a graph: op events flow through
validate -> EventLogStore append -> incremental projection -> subscriber
notification. See openspec/changes/event-log-source-of-truth/specs/graph-session.
*/
export function createGraphSession(
  eventLog: EventLogStore,
  graphId: GraphId,
  deviceId: DeviceId,
): GraphSession {
  const mergeStateCell = { current: createMergeState() as MergeState };
  const currentGraphCell = { current: unwrap(createGraph(graphId, SESSION_GRAPH_NAME)) as Graph };
  const subscribersCell = {
    current: new Set<GraphChangeSubscription>() as ReadonlySet<GraphChangeSubscription>,
  };
  const enqueue = createSessionQueue();

  const notify = (graph: Graph, applied: readonly GraphEvent[]): readonly unknown[] => {
    if (applied.length === 0) return [];
    const delta: GraphSessionDelta = { applied };
    return dispatchChangeHandlers([...subscribersCell.current], graph, delta);
  };

  const load = (): Promise<Result<Graph, Error>> =>
    enqueue(async () => {
      const initial = createGraph(graphId, SESSION_GRAPH_NAME);
      if (!initial.ok) return initial;

      const eventsResult = await eventLog.getEvents(graphId);
      if (!eventsResult.ok) return eventsResult;

      const merged = mergeEvents(createMergeState(), initial.value, eventsResult.value);
      mergeStateCell.current = merged.state;
      currentGraphCell.current = merged.graph;
      return ok(merged.graph);
    });

  const commit = (events: readonly GraphEvent[]): Promise<Result<CommitSuccess, CommitError>> =>
    enqueue(async () => {
      if (events.length === 0) {
        return ok({
          graph: currentGraphCell.current,
          batchId: createBatchId(),
          events: [],
          warnings: [],
        });
      }

      const batchIdResult = resolveCommitBatchId(events);
      if (!batchIdResult.ok) return batchIdResult;
      const batchId = batchIdResult.value;

      const stamped = events.map((event) => ({ ...event, deviceId, batchId }) as GraphEvent);

      const validation = validateBatch(currentGraphCell.current, stamped, batchId);
      if (!validation.ok) return validation;

      const appendResult = await eventLog.appendEvents(graphId, stamped);
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
      notify(merged.graph, merged.applied);

      return ok({
        graph: merged.graph,
        batchId,
        events: stamped,
        warnings: validation.value,
      });
    });

  const subscribe = (handler: GraphChangeHandler): (() => boolean) => {
    const subscription: GraphChangeSubscription = { handler };
    subscribersCell.current = new Set([...subscribersCell.current, subscription]);

    return () => {
      const previousSize = subscribersCell.current.size;
      subscribersCell.current = new Set(
        [...subscribersCell.current].filter((subscription_) => subscription_ !== subscription),
      );
      return subscribersCell.current.size < previousSize;
    };
  };

  return {
    load,
    commit,
    graph: () => currentGraphCell.current,
    subscribe,
  };
}
