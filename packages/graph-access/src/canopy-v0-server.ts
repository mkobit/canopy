import type {
  BatchId,
  Edge,
  EventId,
  EventLogQueryOptions,
  EventLogStore,
  Graph,
  GraphEvent,
  GraphSession,
  Node,
  NodeId,
  PropertyValue,
  Result,
} from '@canopy/graph';
import {
  SYSTEM_IDS,
  asBatchId,
  asDeviceId,
  asEdgeId,
  asEventId,
  asGraphId,
  asNodeId,
  asShapeId,
  createDeviceId,
  createDraftSession,
  createEdgeId,
  createEventId,
  createGraph,
  createGraphId,
  createGraphSession,
  createInstant,
  createNodeId,
  decodeStoredEvent,
  err,
  fromThrowable,
  getGraphAt,
  ok,
} from '@canopy/graph';
import {
  executeQuery as executeQueryEngine,
  getQueryDefinition,
  type QueryStep,
} from '@canopy/queries';
import type {
  CanopyV0ActorProvenance,
  CanopyV0BatchOperation,
  CanopyV0BundleManifestRecord,
  CanopyV0CommitDraftRequest,
  CanopyV0CommitTransactionRequest,
  CanopyV0CommitTransactionResponse,
  CanopyV0CreateDraftRequest,
  CanopyV0CreateGraphRequest,
  CanopyV0DeleteGraphRequest,
  CanopyV0DiscardDraftRequest,
  CanopyV0EdgeRecord,
  CanopyV0EntityCasPrecondition,
  CanopyV0ExecuteStoredQueryRequest,
  CanopyV0GetDraftRequest,
  CanopyV0GetGraphRequest,
  CanopyV0GetSchemaRequest,
  CanopyV0GetViewDefinitionRequest,
  CanopyV0GraphId,
  CanopyV0GraphSummary,
  CanopyV0HistorySnapshotRequest,
  CanopyV0HttpMethod,
  CanopyV0InstallBundleRequest,
  CanopyV0ListBundlesRequest,
  CanopyV0ListGraphsRequest,
  CanopyV0LookupPropertiesRequest,
  CanopyV0NodeRecord,
  CanopyV0PropertyCardinality,
  CanopyV0PropertyEntry,
  CanopyV0PropertyTypeRecord,
  CanopyV0QueryEdgesRequest,
  CanopyV0QueryNodesRequest,
  CanopyV0ReadConsistency,
  CanopyV0RegisterShapeMigrationRequest,
  CanopyV0ResolveSettingRequest,
  CanopyV0ResolveViewRequest,
  CanopyV0RouteDescriptor,
  CanopyV0ServiceHandlers,
  CanopyV0SettingScope,
  CanopyV0ShapeMigrationRecord,
  CanopyV0ShapePropertyBinding,
  CanopyV0ShapeRecord,
  CanopyV0StageDraftOperationsRequest,
  CanopyV0StreamEnvelope,
  CanopyV0StreamReplayRequest,
  CanopyV0StreamSubscribeRequest,
  CanopyV0TraverseGraphRequest,
  CanopyV0ViewBindingKind,
  CanopyV0ViewDefinitionRecord,
  CanopyV0WritePrecondition,
} from './canopy-v0-contract';
import { CANOPY_V0_ROUTES } from './canopy-v0-contract';
import type { GraphAccessContext } from './graph-access-context';
import type { GraphAccessResponse } from './graph-access-payloads';
import { createGraphAccessError, type GraphAccessErrorCategory } from './result-errors';

export interface CanopyV0RouteRequest {
  readonly method: CanopyV0HttpMethod;
  readonly path: string;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | undefined>> | undefined;
}

export interface CanopyV0RouteResponse {
  readonly status: number;
  readonly body: GraphAccessResponse<unknown>;
}

export interface CanopyV0ServerRouter {
  readonly dispatch: (request: CanopyV0RouteRequest) => Promise<CanopyV0RouteResponse>;
}

interface CommittedV0BatchRecord {
  readonly commitSeq: number;
  readonly batchId: BatchId;
  readonly hlcTimestamp: string;
  readonly eventIds: readonly EventId[];
  readonly events: readonly GraphEvent[];
  readonly snapshotGraph: Graph;
}

interface ManagedV0DraftState {
  readonly draftId: string;
  readonly graphId: CanopyV0GraphId;
  readonly status: 'open' | 'committed' | 'discarded';
  readonly baseCommitSeq: number;
  readonly parentRevision: string;
  readonly operations: readonly CanopyV0BatchOperation[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ManagedV0GraphState {
  readonly graphId: CanopyV0GraphId;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly headCommitSeq: number;
  readonly graph: Graph;
  readonly session?: GraphSession | undefined;
  readonly eventLogStore?: EventLogStore | undefined;
  readonly entitySeqs: ReadonlyMap<string, number>;
  readonly commitLog: readonly CommittedV0BatchRecord[];
  readonly drafts: ReadonlyMap<string, ManagedV0DraftState>;
  readonly bundles: readonly CanopyV0BundleManifestRecord[];
  readonly migrations: readonly CanopyV0ShapeMigrationRecord[];
}

interface GraphRegistryStore {
  readonly readAll: () => ReadonlyMap<string, ManagedV0GraphState>;
  readonly writeAll: (next: ReadonlyMap<string, ManagedV0GraphState>) => number;
}

interface BuiltOperationStep {
  readonly events: readonly GraphEvent[];
  readonly touchedEntityIds: readonly string[];
  readonly migration?: CanopyV0ShapeMigrationRecord | undefined;
}

interface BuiltOperationsResult {
  readonly events: readonly GraphEvent[];
  readonly touchedEntityIds: readonly string[];
  readonly newMigrations: readonly CanopyV0ShapeMigrationRecord[];
}

const DEFAULT_MAX_VIEW_DEPTH = 16;
const RENDER_SELECTOR_EDGE_TYPE = asShapeId('system:edgetype:render-selector');

const createEmbeddedEventLogStore = (): EventLogStore => {
  const eventsCell = {
    current: new Map<string, readonly GraphEvent[]>() as ReadonlyMap<string, readonly GraphEvent[]>,
  };

  const appendEvents = async (
    graphId: string,
    events: readonly GraphEvent[],
  ): Promise<Result<void, Error>> => {
    const existing = eventsCell.current.get(graphId) ?? [];
    eventsCell.current = new Map(eventsCell.current).set(graphId, [...existing, ...events]);
    return ok(undefined);
  };

  const getEvents = async (
    graphId: string,
    options?: EventLogQueryOptions,
  ): Promise<Result<readonly GraphEvent[], Error>> => {
    const existing = eventsCell.current.get(graphId) ?? [];
    const decodedResults = existing.map((event) => decodeStoredEvent(event));
    const firstError = decodedResults.find((result) => !result.ok);
    if (firstError && !firstError.ok) return err(new Error(firstError.error.message));
    const decodedEvents = decodedResults.flatMap((result) =>
      result.ok && result.value !== null ? [result.value] : [],
    );
    const afterFiltered =
      options?.after === undefined
        ? decodedEvents
        : decodedEvents.filter((event) => (event.eventId as string) > (options.after as string));
    const beforeFiltered =
      options?.before === undefined
        ? afterFiltered
        : afterFiltered.filter((event) => (event.eventId as string) < (options.before as string));
    const ordered = options?.reverse ? [...beforeFiltered].toReversed() : beforeFiltered;
    const limited = options?.limit === undefined ? ordered : ordered.slice(0, options.limit);
    return ok(limited);
  };

  return { appendEvents, getEvents };
};

const isJsonScalar = (value: unknown): value is string | number | boolean | null =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const isRecordObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePropertyValueJson = (valueJson: string): PropertyValue => {
  const parsed = fromThrowable(() => JSON.parse(valueJson) as unknown);
  if (!parsed.ok) return valueJson;
  const candidate = parsed.value;
  if (isJsonScalar(candidate)) return candidate;
  if (Array.isArray(candidate) && candidate.every(isJsonScalar)) {
    return candidate;
  }
  return isRecordObject(candidate) &&
    typeof candidate.graph === 'string' &&
    typeof candidate.target === 'string'
    ? { graph: asGraphId(candidate.graph), target: asNodeId(candidate.target) }
    : valueJson;
};

const toPropertyMap = (
  entries: readonly CanopyV0PropertyEntry[] | undefined,
): ReadonlyMap<string, PropertyValue> =>
  new Map(
    (entries ?? []).map((entry) => [entry.key, parsePropertyValueJson(entry.valueJson)] as const),
  );

const serializePropertyEntries = (
  properties: ReadonlyMap<string, PropertyValue>,
): readonly CanopyV0PropertyEntry[] =>
  [...properties].map(([key, value]) => ({
    key,
    valueJson: JSON.stringify(value),
  }));

const toNodeRecord = (node: Node, entitySeqs: ReadonlyMap<string, number>): CanopyV0NodeRecord => ({
  nodeId: node.id,
  ...(node.shape !== undefined && { shapeId: node.shape }),
  entitySeq: entitySeqs.get(node.id) ?? 0,
  properties: serializePropertyEntries(node.properties),
  createdAt: node.metadata.created,
  updatedAt: node.metadata.modified,
});

const toEdgeRecord = (edge: Edge, entitySeqs: ReadonlyMap<string, number>): CanopyV0EdgeRecord => ({
  edgeId: edge.id,
  shapeId: edge.shape ?? asShapeId(''),
  sourceNodeId: edge.source,
  targetNodeId: edge.target,
  entitySeq: entitySeqs.get(edge.id) ?? 0,
  properties: serializePropertyEntries(edge.properties),
});

const currentGraphOf = (state: ManagedV0GraphState): Graph =>
  state.session ? state.session.graph() : state.graph;

const createGraphSummary = (state: ManagedV0GraphState): CanopyV0GraphSummary => {
  const graph = currentGraphOf(state);
  return {
    graphId: state.graphId,
    name: state.name,
    headCommitSeq: state.headCommitSeq,
    revision: graph.revision,
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.size,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
};

const resolveConsistentGraph = async (
  state: ManagedV0GraphState,
  consistency: CanopyV0ReadConsistency | undefined,
): Promise<GraphAccessResponse<Readonly<{ graph: Graph; commitSeq: number }>>> => {
  if (consistency?.atCommitSeq !== undefined) {
    if (consistency.atCommitSeq === 0 && state.commitLog.length === 0) {
      return ok({ graph: currentGraphOf(state), commitSeq: 0 });
    }
    const matching = state.commitLog.findLast(
      (entry) => entry.commitSeq <= (consistency.atCommitSeq ?? 0),
    );
    return matching
      ? ok({ graph: matching.snapshotGraph, commitSeq: matching.commitSeq })
      : err(
          createGraphAccessError(
            'NOT_FOUND',
            `No snapshot found at commitSeq ${consistency.atCommitSeq}`,
          ),
        );
  }
  if (consistency?.atTimestamp !== undefined && state.eventLogStore) {
    const snapshotResult = await getGraphAt(state.eventLogStore, state.graphId, {
      timestamp: createInstant(Temporal.Instant.from(consistency.atTimestamp)),
    });
    return snapshotResult.ok
      ? ok({ graph: snapshotResult.value, commitSeq: state.headCommitSeq })
      : err(createGraphAccessError('INTERNAL_ERROR', snapshotResult.error.message));
  }
  return consistency?.minCommitSeq !== undefined && consistency.minCommitSeq > state.headCommitSeq
    ? err(
        createGraphAccessError(
          'CONCURRENCY_CONFLICT',
          `Graph commitSeq ${state.headCommitSeq} has not reached minCommitSeq ${consistency.minCommitSeq}`,
        ),
      )
    : ok({ graph: currentGraphOf(state), commitSeq: state.headCommitSeq });
};

const checkWritePrecondition = (
  state: ManagedV0GraphState,
  precondition: CanopyV0WritePrecondition,
): GraphAccessResponse<undefined> => {
  if (precondition.mode === 'graph-cas') {
    return precondition.expectedGraphSeq === state.headCommitSeq
      ? ok(undefined)
      : err(
          createGraphAccessError(
            'CONCURRENCY_CONFLICT',
            `Graph CAS mismatch: expected commitSeq ${String(precondition.expectedGraphSeq)}, actual ${state.headCommitSeq}`,
          ),
        );
  }
  if (precondition.mode === 'entity-cas') {
    const mismatch = (precondition.expectedEntitySeq ?? []).find((item) => {
      const actualSeq = state.entitySeqs.get(item.entityId) ?? 0;
      return actualSeq !== item.expectedSeq;
    });
    if (mismatch) {
      const actualSeq = state.entitySeqs.get(mismatch.entityId) ?? 0;
      return err(
        createGraphAccessError(
          'CONCURRENCY_CONFLICT',
          `Entity CAS mismatch for ${mismatch.entityId}: expected ${mismatch.expectedSeq}, actual ${actualSeq}`,
        ),
      );
    }
  }
  return ok(undefined);
};

const buildCreateNodeEvent = (
  operation: CanopyV0BatchOperation,
  provenance: CanopyV0ActorProvenance,
  batchId: BatchId,
): GraphAccessResponse<BuiltOperationStep> => {
  const nodeId = asNodeId(operation.entityId ?? createNodeId());
  return ok({
    events: [
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeId,
        ...(operation.shapeId !== undefined && { shapeId: asShapeId(operation.shapeId) }),
        properties: toPropertyMap(operation.properties),
        timestamp: createInstant(),
        deviceId: asDeviceId(provenance.deviceId),
        batchId,
      },
    ],
    touchedEntityIds: [nodeId],
  });
};

const buildUpdateNodePropertiesEvent = (
  operation: CanopyV0BatchOperation,
  provenance: CanopyV0ActorProvenance,
  batchId: BatchId,
): GraphAccessResponse<BuiltOperationStep> => {
  if (!operation.entityId) {
    return err(
      createGraphAccessError('VALIDATION_ERROR', 'entityId is required for update-node-properties'),
    );
  }
  const nodeId = asNodeId(operation.entityId);
  return ok({
    events: [
      {
        type: 'NodePropertiesUpdated',
        eventId: createEventId(),
        id: nodeId,
        changes: toPropertyMap(operation.properties),
        timestamp: createInstant(),
        deviceId: asDeviceId(provenance.deviceId),
        batchId,
      },
    ],
    touchedEntityIds: [nodeId],
  });
};

const buildDeleteNodeEvents = (
  operation: CanopyV0BatchOperation,
  provenance: CanopyV0ActorProvenance,
  batchId: BatchId,
  currentGraph: Graph,
): GraphAccessResponse<BuiltOperationStep> => {
  if (!operation.entityId) {
    return err(createGraphAccessError('VALIDATION_ERROR', 'entityId is required for delete-node'));
  }
  const nodeId = asNodeId(operation.entityId);
  const deviceId = asDeviceId(provenance.deviceId);
  const timestamp = createInstant();
  const matchingEdges = [...currentGraph.edges.values()].filter(
    (edge) => edge.source === nodeId || edge.target === nodeId,
  );
  const edgeEvents: readonly GraphEvent[] = matchingEdges.map((edge) => ({
    type: 'EdgeDeleted',
    eventId: createEventId(),
    id: edge.id,
    timestamp,
    deviceId,
    batchId,
  }));
  const nodeEvent: GraphEvent = {
    type: 'NodeDeleted',
    eventId: createEventId(),
    id: nodeId,
    timestamp,
    deviceId,
    batchId,
  };
  return ok({
    events: [nodeEvent, ...edgeEvents],
    touchedEntityIds: [nodeId, ...matchingEdges.map((edge) => edge.id)],
  });
};

const buildCreateEdgeEvent = (
  operation: CanopyV0BatchOperation,
  provenance: CanopyV0ActorProvenance,
  batchId: BatchId,
): GraphAccessResponse<BuiltOperationStep> => {
  if (!operation.sourceNodeId || !operation.targetNodeId || !operation.edgeTypeId) {
    return err(
      createGraphAccessError(
        'VALIDATION_ERROR',
        'sourceNodeId, targetNodeId, and edgeTypeId are required for create-edge',
      ),
    );
  }
  const edgeId = asEdgeId(operation.entityId ?? createEdgeId());
  return ok({
    events: [
      {
        type: 'EdgeCreated',
        eventId: createEventId(),
        id: edgeId,
        shapeId: asShapeId(operation.edgeTypeId),
        source: asNodeId(operation.sourceNodeId),
        target: asNodeId(operation.targetNodeId),
        properties: toPropertyMap(operation.properties),
        timestamp: createInstant(),
        deviceId: asDeviceId(provenance.deviceId),
        batchId,
      },
    ],
    touchedEntityIds: [edgeId],
  });
};

const buildDeleteEdgeEvent = (
  operation: CanopyV0BatchOperation,
  provenance: CanopyV0ActorProvenance,
  batchId: BatchId,
): GraphAccessResponse<BuiltOperationStep> => {
  if (!operation.entityId) {
    return err(createGraphAccessError('VALIDATION_ERROR', 'entityId is required for delete-edge'));
  }
  const edgeId = asEdgeId(operation.entityId);
  return ok({
    events: [
      {
        type: 'EdgeDeleted',
        eventId: createEventId(),
        id: edgeId,
        timestamp: createInstant(),
        deviceId: asDeviceId(provenance.deviceId),
        batchId,
      },
    ],
    touchedEntityIds: [edgeId],
  });
};

const buildRegisterMigrationEvents = (
  operation: CanopyV0BatchOperation,
  provenance: CanopyV0ActorProvenance,
  batchId: BatchId,
  nextCommitSeq: number,
): GraphAccessResponse<BuiltOperationStep> => {
  if (!operation.fromShapeId || !operation.toShapeId || !operation.transformWasmRef) {
    return err(
      createGraphAccessError(
        'VALIDATION_ERROR',
        'fromShapeId, toShapeId, and transformWasmRef are required for register-shape-migration',
      ),
    );
  }
  const migrationId = operation.migrationId ?? `migration:${createNodeId()}`;
  const migrationNodeId = asNodeId(operation.entityId ?? migrationId);
  const migration: CanopyV0ShapeMigrationRecord = {
    migrationId,
    fromShapeId: operation.fromShapeId,
    toShapeId: operation.toShapeId,
    transformWasmRef: operation.transformWasmRef,
    status: 'registered',
    registeredCommitSeq: nextCommitSeq,
  };
  const migrationEvent: GraphEvent = {
    type: 'NodeCreated',
    eventId: createEventId(),
    id: migrationNodeId,
    shapeId: asShapeId('system:nodetype:shape-migration'),
    properties: new Map<string, PropertyValue>([
      ['migrationId', migrationId],
      ['fromShapeId', operation.fromShapeId],
      ['toShapeId', operation.toShapeId],
      ['transformWasmRef', operation.transformWasmRef],
      ['status', 'registered'],
    ]),
    timestamp: createInstant(),
    deviceId: asDeviceId(provenance.deviceId),
    batchId,
  };
  return ok({
    events: [migrationEvent],
    touchedEntityIds: [migrationNodeId],
    migration,
  });
};

const buildOperationEvent = (
  operation: CanopyV0BatchOperation,
  provenance: CanopyV0ActorProvenance,
  batchId: BatchId,
  nextCommitSeq: number,
  currentGraph: Graph,
): GraphAccessResponse<BuiltOperationStep> => {
  switch (operation.kind) {
    case 'create-node': {
      return buildCreateNodeEvent(operation, provenance, batchId);
    }
    case 'update-node-properties': {
      return buildUpdateNodePropertiesEvent(operation, provenance, batchId);
    }
    case 'delete-node': {
      return buildDeleteNodeEvents(operation, provenance, batchId, currentGraph);
    }
    case 'create-edge': {
      return buildCreateEdgeEvent(operation, provenance, batchId);
    }
    case 'delete-edge': {
      return buildDeleteEdgeEvent(operation, provenance, batchId);
    }
    case 'register-shape-migration': {
      return buildRegisterMigrationEvents(operation, provenance, batchId, nextCommitSeq);
    }
  }
};

const compileBatchOperations = (
  operations: readonly CanopyV0BatchOperation[],
  provenance: CanopyV0ActorProvenance,
  batchId: BatchId,
  nextCommitSeq: number,
  currentGraph: Graph,
): GraphAccessResponse<BuiltOperationsResult> => {
  const step = (
    remaining: readonly CanopyV0BatchOperation[],
    accumulated: BuiltOperationsResult,
  ): GraphAccessResponse<BuiltOperationsResult> => {
    const [head, ...tail] = remaining;
    if (!head) return ok(accumulated);
    const built = buildOperationEvent(head, provenance, batchId, nextCommitSeq, currentGraph);
    if (!built.ok) return built;
    return step(tail, {
      events: [...accumulated.events, ...built.value.events],
      touchedEntityIds: [...accumulated.touchedEntityIds, ...built.value.touchedEntityIds],
      newMigrations: built.value.migration
        ? [...accumulated.newMigrations, built.value.migration]
        : accumulated.newMigrations,
    });
  };
  return step(operations, { events: [], touchedEntityIds: [], newMigrations: [] });
};

const updateEntitySequences = (
  current: ReadonlyMap<string, number>,
  touchedIds: readonly string[],
  commitSeq: number,
): ReadonlyMap<string, number> => {
  const entries = touchedIds.map((id) => [id, commitSeq] as const);
  return new Map([...current, ...entries]);
};

const commitOperationsToGraphState = async (
  state: ManagedV0GraphState,
  operations: readonly CanopyV0BatchOperation[],
  provenance: CanopyV0ActorProvenance,
  precondition: CanopyV0WritePrecondition,
  batchIdInput?: string,
): Promise<
  GraphAccessResponse<
    Readonly<{ nextState: ManagedV0GraphState; response: CanopyV0CommitTransactionResponse }>
  >
> => {
  const preconditionCheck = checkWritePrecondition(state, precondition);
  if (!preconditionCheck.ok) return preconditionCheck;

  const batchId = asBatchId(batchIdInput ?? `batch:${createEventId()}`);
  const nextCommitSeq = state.headCommitSeq + 1;
  const compiled = compileBatchOperations(
    operations,
    provenance,
    batchId,
    nextCommitSeq,
    currentGraphOf(state),
  );
  if (!compiled.ok) return compiled;

  const session =
    state.session ??
    createGraphSession(
      state.eventLogStore ?? createEmbeddedEventLogStore(),
      asGraphId(state.graphId),
      asDeviceId(provenance.deviceId),
    );
  const commitResult = await session.commit(compiled.value.events);
  if (!commitResult.ok) {
    return err(createGraphAccessError('VALIDATION_ERROR', commitResult.error.message));
  }

  const nextGraph = commitResult.value;
  const nextEntitySeqs = updateEntitySequences(
    state.entitySeqs,
    compiled.value.touchedEntityIds,
    nextCommitSeq,
  );
  const affectedEntitySeqs: readonly CanopyV0EntityCasPrecondition[] = [
    ...new Set(compiled.value.touchedEntityIds),
  ].map((entityId) => ({ entityId, expectedSeq: nextCommitSeq }));
  const eventIds = compiled.value.events.map((event) => event.eventId);
  const nextState: ManagedV0GraphState = {
    ...state,
    updatedAt: createInstant(),
    headCommitSeq: nextCommitSeq,
    graph: nextGraph,
    session,
    entitySeqs: nextEntitySeqs,
    commitLog: [
      ...state.commitLog,
      {
        commitSeq: nextCommitSeq,
        batchId,
        hlcTimestamp: provenance.hlcTimestamp,
        eventIds,
        events: compiled.value.events,
        snapshotGraph: nextGraph,
      },
    ],
    migrations: [...state.migrations, ...compiled.value.newMigrations],
  };

  return ok({
    nextState,
    response: {
      graphId: state.graphId,
      batchId,
      commitSeq: nextCommitSeq,
      hlcTimestamp: provenance.hlcTimestamp,
      revision: nextGraph.revision,
      committedEventIds: eventIds,
      affectedEntitySeqs,
    },
  });
};

const parseViewBindingKind = (
  bindingProperty: PropertyValue | undefined,
  queryReference: PropertyValue | undefined,
): CanopyV0ViewBindingKind => {
  if (bindingProperty === 'standalone') return 'standalone';
  if (bindingProperty === 'shape-bound') return 'shape-bound';
  if (bindingProperty === 'open-node') return 'open-node';
  if (bindingProperty === 'entity-bound') return 'entity-bound';
  if (bindingProperty === 'query-bound') return 'query-bound';
  return typeof queryReference === 'string' ? 'query-bound' : 'standalone';
};

const extractViewDefinitionRecord = (node: Node): CanopyV0ViewDefinitionRecord => {
  const nameValue = node.properties.get('name');
  const layoutValue = node.properties.get('layout');
  const queryReference = node.properties.get('queryRef');
  const rendererReference = node.properties.get('rendererPluginRef');
  const isHermeticProperty = node.properties.get('isHermetic');

  return {
    viewNodeId: node.id,
    name: typeof nameValue === 'string' ? nameValue : node.id,
    layout: typeof layoutValue === 'string' ? layoutValue : 'layout-stack',
    bindingKind: parseViewBindingKind(node.properties.get('bindingKind'), queryReference),
    ...(typeof queryReference === 'string' && { queryNodeId: queryReference }),
    ...(typeof rendererReference === 'string' && { rendererPluginRef: rendererReference }),
    isHermetic: isHermeticProperty !== false,
  };
};

interface ResolvedSelectorMatch {
  readonly viewNode: Node;
  readonly priority: number;
  readonly isDefault: boolean;
}

const findSelectorCandidateViews = (
  graph: Graph,
  request: CanopyV0ResolveViewRequest,
): readonly ResolvedSelectorMatch[] => {
  const requestedContext = request.context ?? 'default';
  return [...graph.edges.values()]
    .filter(
      (edge) =>
        edge.shape === RENDER_SELECTOR_EDGE_TYPE ||
        edge.shape === asShapeId('system:edgetype:view-override') ||
        edge.shape === asShapeId('system:edgetype:default-view'),
    )
    .flatMap((edge): readonly ResolvedSelectorMatch[] => {
      const edgeContext = edge.properties.get('context');
      if (typeof edgeContext === 'string' && edgeContext !== requestedContext) return [];
      const matchesTarget =
        (request.targetNodeId !== undefined && edge.source === request.targetNodeId) ||
        (request.targetShapeId !== undefined && edge.source === request.targetShapeId) ||
        (request.queryNodeId !== undefined && edge.source === request.queryNodeId);
      if (!matchesTarget) return [];
      const viewNode = graph.nodes.get(edge.target);
      if (!viewNode) return [];
      const priorityValue = edge.properties.get('priority');
      return [
        {
          viewNode,
          priority: typeof priorityValue === 'number' ? priorityValue : 0,
          isDefault: edge.properties.get('isDefault') === true,
        },
      ];
    })
    .toSorted((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      if (left.isDefault === right.isDefault) return 0;
      return left.isDefault ? -1 : 1;
    });
};

const followViewChain = (
  graph: Graph,
  currentViewId: string,
  visitedViewIds: readonly string[],
  maxDepth: number,
): Readonly<{ terminalViewId: string; visitedPath: readonly string[]; cycleDetected: boolean }> => {
  if (visitedViewIds.includes(currentViewId)) {
    return {
      terminalViewId: currentViewId,
      visitedPath: [...visitedViewIds, currentViewId],
      cycleDetected: true,
    };
  }
  const nextPath = [...visitedViewIds, currentViewId];
  if (nextPath.length > maxDepth) {
    return { terminalViewId: currentViewId, visitedPath: nextPath, cycleDetected: true };
  }
  const delegateEdge = graph.edges
    .values()
    .find(
      (edge) =>
        edge.source === currentViewId &&
        (edge.shape === RENDER_SELECTOR_EDGE_TYPE ||
          edge.shape === asShapeId('system:edgetype:uses-renderer')),
    );
  if (!delegateEdge) {
    return { terminalViewId: currentViewId, visitedPath: nextPath, cycleDetected: false };
  }
  const targetNode = graph.nodes.get(delegateEdge.target);
  return targetNode?.shape === SYSTEM_IDS.VIEW_DEFINITION
    ? followViewChain(graph, targetNode.id, nextPath, maxDepth)
    : { terminalViewId: currentViewId, visitedPath: nextPath, cycleDetected: false };
};

const resolveViewNodesForDisplay = (
  graph: Graph,
  view: CanopyV0ViewDefinitionRecord,
  request: CanopyV0ResolveViewRequest,
  entitySeqs: ReadonlyMap<string, number>,
): readonly CanopyV0NodeRecord[] => {
  const effectiveQueryId = request.queryNodeId ?? view.queryNodeId;
  if (effectiveQueryId !== undefined) {
    const queryResult = getQueryDefinition(graph, asNodeId(effectiveQueryId));
    if (queryResult.ok) {
      const executed = executeQueryEngine(graph, queryResult.value);
      if (executed.ok) {
        return executed.value.nodes.map((node) => toNodeRecord(node, entitySeqs));
      }
    }
  }
  if (request.targetNodeId !== undefined) {
    const targetNode = graph.nodes.get(asNodeId(request.targetNodeId));
    return targetNode ? [toNodeRecord(targetNode, entitySeqs)] : [];
  }
  return [];
};

const formatSettingValueJson = (rawValue: PropertyValue): string =>
  typeof rawValue === 'string' && fromThrowable(() => JSON.parse(rawValue) as unknown).ok
    ? rawValue
    : JSON.stringify(rawValue);

const buildSettingScopeCandidates = (
  request: CanopyV0ResolveSettingRequest,
): readonly Readonly<{
  scope: CanopyV0SettingScope;
  acceptedScopeTypes: readonly string[];
  targetId?: string | undefined;
}>[] => [
  ...(request.nodeId === undefined
    ? []
    : [{ scope: 'node' as const, acceptedScopeTypes: ['node'], targetId: request.nodeId }]),
  ...(request.shapeId === undefined
    ? []
    : [
        {
          scope: 'shape' as const,
          acceptedScopeTypes: ['shape', 'type'],
          targetId: request.shapeId,
        },
      ]),
  ...(request.namespaceId === undefined
    ? []
    : [
        {
          scope: 'namespace' as const,
          acceptedScopeTypes: ['namespace'],
          targetId: request.namespaceId,
        },
      ]),
  { scope: 'global' as const, acceptedScopeTypes: ['global'], targetId: undefined },
];

const resolveSettingFromGraph = (
  graph: Graph,
  request: CanopyV0ResolveSettingRequest,
): Readonly<{ scope: CanopyV0SettingScope; valueJson?: string; found: boolean }> => {
  const schemaNode = graph.nodes
    .values()
    .find(
      (node) =>
        node.shape === SYSTEM_IDS.SETTINGS_SCHEMA && node.properties.get('key') === request.key,
    );
  const settingNodes = [...graph.nodes.values()].filter(
    (node) =>
      node.shape === SYSTEM_IDS.USER_SETTING &&
      (node.properties.get('key') === request.key ||
        (schemaNode !== undefined && node.properties.get('schemaId') === schemaNode.id)),
  );

  const matchedScope = buildSettingScopeCandidates(request)
    .map((candidate) => {
      const hit = settingNodes.find((node) => {
        const nodeScope = node.properties.get('scopeType') ?? node.properties.get('scope');
        const nodeTarget = node.properties.get('scopeTarget') ?? node.properties.get('targetId');
        return (
          typeof nodeScope === 'string' &&
          candidate.acceptedScopeTypes.includes(nodeScope) &&
          (candidate.targetId === undefined || nodeTarget === candidate.targetId)
        );
      });
      return hit ? { scope: candidate.scope, node: hit } : undefined;
    })
    .find(
      (item): item is Readonly<{ scope: CanopyV0SettingScope; node: Node }> => item !== undefined,
    );

  if (matchedScope) {
    const rawValue = matchedScope.node.properties.get('value');
    return {
      scope: matchedScope.scope,
      ...(rawValue !== undefined && { valueJson: formatSettingValueJson(rawValue) }),
      found: rawValue !== undefined,
    };
  }

  const defaultValue = schemaNode?.properties.get('defaultValue');
  return defaultValue === undefined
    ? { scope: 'default', found: false }
    : { scope: 'default', valueJson: formatSettingValueJson(defaultValue), found: true };
};

const extractShapeRecordsFromGraph = (graph: Graph): readonly CanopyV0ShapeRecord[] =>
  [...graph.nodes.values()]
    .filter((node) => node.shape === SYSTEM_IDS.SHAPE)
    .map((node) => {
      const nameValue = node.properties.get('name');
      const schemaOrgValue = node.properties.get('schemaOrgUri');
      const rawProperties = node.properties.get('properties');
      const parsedBindings: readonly CanopyV0ShapePropertyBinding[] = (() => {
        if (typeof rawProperties !== 'string') return [];
        const parsed = fromThrowable(() => JSON.parse(rawProperties) as unknown);
        if (!parsed.ok || !Array.isArray(parsed.value)) return [];
        return parsed.value.flatMap((entry): readonly CanopyV0ShapePropertyBinding[] => {
          if (!isRecordObject(entry)) return [];
          if (entry.kind === 'reference' && typeof entry.name === 'string') {
            const cardinality: CanopyV0PropertyCardinality =
              entry.cardinality === 'many' ? 'many' : 'one';
            return [
              {
                key: entry.name,
                ...(typeof entry.propertyTypeId === 'string' && {
                  propertyTypeId: entry.propertyTypeId,
                }),
                required: entry.required === true,
                cardinality,
              },
            ];
          }
          const definition =
            entry.kind === 'inline' && isRecordObject(entry.definition) ? entry.definition : entry;
          if (typeof definition.name !== 'string') return [];
          const cardinality: CanopyV0PropertyCardinality =
            definition.cardinality === 'many' || definition.valueKind === 'list' ? 'many' : 'one';
          return [
            {
              key: definition.name,
              required: definition.required === true,
              cardinality,
            },
          ];
        });
      })();

      return {
        shapeId: node.id,
        name: typeof nameValue === 'string' ? nameValue : node.id,
        entityKind: node.properties.get('entityKind') === 'edge' ? 'edge' : 'node',
        closed: node.properties.get('closed') === true,
        properties: parsedBindings,
        ...(typeof schemaOrgValue === 'string' && { schemaOrgUri: schemaOrgValue }),
      };
    });

const extractPropertyTypesFromGraph = (graph: Graph): readonly CanopyV0PropertyTypeRecord[] =>
  [...graph.nodes.values()]
    .filter((node) => node.shape === SYSTEM_IDS.PROPERTY_TYPE)
    .map((node) => {
      const nameValue = node.properties.get('name');
      const valueKindValue = node.properties.get('valueKind') ?? node.properties.get('scalarKind');
      const schemaOrgValue = node.properties.get('schemaOrgUri');
      return {
        propertyTypeId: node.id,
        name: typeof nameValue === 'string' ? nameValue : node.id,
        scalarKind: typeof valueKindValue === 'string' ? valueKindValue : 'text',
        cardinality: node.properties.get('cardinality') === 'many' ? 'many' : 'one',
        ...(typeof schemaOrgValue === 'string' && { schemaOrgUri: schemaOrgValue }),
      };
    });

const formatGraphEventJson = (event: GraphEvent): string =>
  JSON.stringify({
    ...event,
    ...('properties' in event && { properties: Object.fromEntries(event.properties) }),
    ...('changes' in event && { changes: Object.fromEntries(event.changes) }),
  });

const stepBfsTraversal = (
  graph: Graph,
  startNodeIds: readonly NodeId[],
  edgeShapeId: string | undefined,
  direction: 'in' | 'out' | 'both',
  maxDepth: number,
  maxCost: number,
): GraphAccessResponse<Readonly<{ nodes: readonly Node[]; edges: readonly Edge[] }>> => {
  const initialNodes = startNodeIds
    .map((id) => graph.nodes.get(id))
    .filter((node): node is Node => node !== undefined);
  const allEdges = [...graph.edges.values()];

  const walk = (
    queue: readonly Readonly<{ id: NodeId; depth: number }>[],
    visitedNodeIds: ReadonlySet<string>,
    visitedEdgeIds: ReadonlySet<string>,
    collectedNodes: readonly Node[],
    collectedEdges: readonly Edge[],
  ): GraphAccessResponse<Readonly<{ nodes: readonly Node[]; edges: readonly Edge[] }>> => {
    const [current, ...restQueue] = queue;
    if (!current) return ok({ nodes: collectedNodes, edges: collectedEdges });
    if (current.depth >= maxDepth) {
      return walk(restQueue, visitedNodeIds, visitedEdgeIds, collectedNodes, collectedEdges);
    }

    const matchingEdges = allEdges.filter((edge) => {
      if (edgeShapeId && edge.shape !== edgeShapeId) return false;
      const outMatch = (direction === 'out' || direction === 'both') && edge.source === current.id;
      const inMatch = (direction === 'in' || direction === 'both') && edge.target === current.id;
      return outMatch || inMatch;
    });

    const nextEdges = matchingEdges.filter((edge) => !visitedEdgeIds.has(edge.id));
    const nextEdgeSet = new Set([...visitedEdgeIds, ...nextEdges.map((edge) => edge.id)]);
    const neighborIds = matchingEdges
      .map((edge) => (edge.source === current.id ? edge.target : edge.source))
      .filter((id) => !visitedNodeIds.has(id));
    const uniqueNewNodes = [...new Set(neighborIds)]
      .map((id) => graph.nodes.get(id))
      .filter((node): node is Node => node !== undefined);

    if (visitedNodeIds.size + uniqueNewNodes.length > maxCost) {
      return err(
        createGraphAccessError('RESOURCE_EXHAUSTED', `Traversal cost exceeded limit ${maxCost}`),
      );
    }

    const nextNodeSet = new Set([...visitedNodeIds, ...uniqueNewNodes.map((node) => node.id)]);
    const nextQueue = [
      ...restQueue,
      ...uniqueNewNodes.map((node) => ({ id: node.id, depth: current.depth + 1 })),
    ];
    return walk(
      nextQueue,
      nextNodeSet,
      nextEdgeSet,
      [...collectedNodes, ...uniqueNewNodes],
      [...collectedEdges, ...nextEdges],
    );
  };

  return walk(
    initialNodes.map((node) => ({ id: node.id, depth: 0 })),
    new Set(initialNodes.map((node) => node.id)),
    new Set(),
    initialNodes,
    [],
  );
};

const getManagedGraphFromRegistry = (
  registry: GraphRegistryStore,
  graphId: CanopyV0GraphId,
): GraphAccessResponse<ManagedV0GraphState> => {
  const state = registry.readAll().get(graphId);
  return state
    ? ok(state)
    : err(createGraphAccessError('NOT_FOUND', `Graph not found: ${graphId}`));
};

const setManagedGraphInRegistry = (
  registry: GraphRegistryStore,
  state: ManagedV0GraphState,
): ManagedV0GraphState => {
  registry.writeAll(new Map(registry.readAll()).set(state.graphId, state));
  return state;
};

const createGraphsHandlers = (registry: GraphRegistryStore): CanopyV0ServiceHandlers['graphs'] => ({
  listGraphs: async (request: CanopyV0ListGraphsRequest) => {
    const allSummaries = [...registry.readAll().values()].map(createGraphSummary);
    const limited =
      request.limit !== undefined && request.limit > 0
        ? allSummaries.slice(0, request.limit)
        : allSummaries;
    return ok({ graphs: limited });
  },
  createGraph: async (request: CanopyV0CreateGraphRequest) => {
    const graphId = asGraphId(request.graphId ?? createGraphId());
    if (registry.readAll().has(graphId)) {
      return err(createGraphAccessError('CONCURRENCY_CONFLICT', `Graph ${graphId} already exists`));
    }
    const createdResult = createGraph(graphId, request.name);
    if (!createdResult.ok) {
      return err(createGraphAccessError('VALIDATION_ERROR', createdResult.error.message));
    }
    const store = createEmbeddedEventLogStore();
    const deviceId = asDeviceId(request.provenance?.deviceId ?? createDeviceId());
    const session = createGraphSession(store, graphId, deviceId);
    await session.load();
    const timestamp = createInstant();
    const newState = setManagedGraphInRegistry(registry, {
      graphId,
      name: request.name,
      createdAt: timestamp,
      updatedAt: timestamp,
      headCommitSeq: 0,
      graph: session.graph(),
      session,
      eventLogStore: store,
      entitySeqs: new Map(),
      commitLog: [],
      drafts: new Map(),
      bundles: [],
      migrations: [],
    });
    return ok(createGraphSummary(newState));
  },
  getGraph: async (request: CanopyV0GetGraphRequest) => {
    const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
    if (!stateResult.ok) return stateResult;
    const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
    if (!consistent.ok) return consistent;
    const summary = createGraphSummary(stateResult.value);
    return ok({
      ...summary,
      headCommitSeq: consistent.value.commitSeq,
      revision: consistent.value.graph.revision,
      nodeCount: consistent.value.graph.nodes.size,
      edgeCount: consistent.value.graph.edges.size,
    });
  },
  deleteGraph: async (request: CanopyV0DeleteGraphRequest) => {
    const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
    if (!stateResult.ok) return stateResult;
    if (
      request.expectedGraphSeq !== undefined &&
      request.expectedGraphSeq !== stateResult.value.headCommitSeq
    ) {
      return err(
        createGraphAccessError(
          'CONCURRENCY_CONFLICT',
          `Delete graph CAS mismatch: expected ${request.expectedGraphSeq}, actual ${stateResult.value.headCommitSeq}`,
        ),
      );
    }
    registry.writeAll(new Map([...registry.readAll()].filter(([id]) => id !== request.graphId)));
    return ok({ graphId: request.graphId, deleted: true });
  },
});

const handleCommitTransaction = async (
  registry: GraphRegistryStore,
  request: CanopyV0CommitTransactionRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const committed = await commitOperationsToGraphState(
    stateResult.value,
    request.operations,
    request.provenance,
    request.precondition,
    request.batchId,
  );
  if (!committed.ok) return committed;
  setManagedGraphInRegistry(registry, committed.value.nextState);
  return ok(committed.value.response);
};

const handleCreateDraft = async (
  registry: GraphRegistryStore,
  request: CanopyV0CreateDraftRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const state = stateResult.value;
  const draftId = request.draftId ?? `draft:${createEventId()}`;
  if (state.drafts.has(draftId)) {
    return err(createGraphAccessError('CONCURRENCY_CONFLICT', `Draft ${draftId} already exists`));
  }
  const draftSession = state.session ? createDraftSession(state.session) : undefined;
  const revisionResult = draftSession?.getParentRevision();
  const parentRevision = revisionResult?.ok ? revisionResult.value : currentGraphOf(state).revision;
  const timestamp = createInstant();
  const draft: ManagedV0DraftState = {
    draftId,
    graphId: state.graphId,
    status: 'open',
    baseCommitSeq: state.headCommitSeq,
    parentRevision,
    operations: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  setManagedGraphInRegistry(registry, {
    ...state,
    drafts: new Map(state.drafts).set(draftId, draft),
  });
  return ok({
    draftId: draft.draftId,
    graphId: draft.graphId,
    status: draft.status,
    baseCommitSeq: draft.baseCommitSeq,
    parentRevision: draft.parentRevision,
    stagedOperationCount: 0,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  });
};

const handleGetDraft = async (registry: GraphRegistryStore, request: CanopyV0GetDraftRequest) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const draft = stateResult.value.drafts.get(request.draftId);
  return draft
    ? ok({
        draftId: draft.draftId,
        graphId: draft.graphId,
        status: draft.status,
        baseCommitSeq: draft.baseCommitSeq,
        parentRevision: draft.parentRevision,
        stagedOperationCount: draft.operations.length,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      })
    : err(createGraphAccessError('NOT_FOUND', `Draft not found: ${request.draftId}`));
};

const handleStageDraftOperations = async (
  registry: GraphRegistryStore,
  request: CanopyV0StageDraftOperationsRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const draft = stateResult.value.drafts.get(request.draftId);
  if (!draft) {
    return err(createGraphAccessError('NOT_FOUND', `Draft not found: ${request.draftId}`));
  }
  if (draft.status !== 'open') {
    return err(
      createGraphAccessError('CONCURRENCY_CONFLICT', `Draft ${draft.draftId} is ${draft.status}`),
    );
  }
  const updatedDraft: ManagedV0DraftState = {
    ...draft,
    operations: [...draft.operations, ...request.operations],
    updatedAt: createInstant(),
  };
  setManagedGraphInRegistry(registry, {
    ...stateResult.value,
    drafts: new Map(stateResult.value.drafts).set(draft.draftId, updatedDraft),
  });
  return ok({
    draftId: updatedDraft.draftId,
    graphId: updatedDraft.graphId,
    status: updatedDraft.status,
    baseCommitSeq: updatedDraft.baseCommitSeq,
    parentRevision: updatedDraft.parentRevision,
    stagedOperationCount: updatedDraft.operations.length,
    createdAt: updatedDraft.createdAt,
    updatedAt: updatedDraft.updatedAt,
  });
};

const handleCommitDraft = async (
  registry: GraphRegistryStore,
  request: CanopyV0CommitDraftRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const draft = stateResult.value.drafts.get(request.draftId);
  if (!draft) {
    return err(createGraphAccessError('NOT_FOUND', `Draft not found: ${request.draftId}`));
  }
  if (draft.status !== 'open') {
    return err(
      createGraphAccessError('CONCURRENCY_CONFLICT', `Draft ${draft.draftId} is ${draft.status}`),
    );
  }
  const precondition: CanopyV0WritePrecondition = request.precondition ?? {
    mode: 'graph-cas',
    expectedGraphSeq: draft.baseCommitSeq,
  };
  const committed = await commitOperationsToGraphState(
    stateResult.value,
    draft.operations,
    request.provenance,
    precondition,
  );
  if (!committed.ok) return committed;
  const nextDraft: ManagedV0DraftState = {
    ...draft,
    status: 'committed',
    updatedAt: createInstant(),
  };
  setManagedGraphInRegistry(registry, {
    ...committed.value.nextState,
    drafts: new Map(committed.value.nextState.drafts).set(draft.draftId, nextDraft),
  });
  return ok(committed.value.response);
};

const handleDiscardDraft = async (
  registry: GraphRegistryStore,
  request: CanopyV0DiscardDraftRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const draft = stateResult.value.drafts.get(request.draftId);
  if (!draft) {
    return err(createGraphAccessError('NOT_FOUND', `Draft not found: ${request.draftId}`));
  }
  const discarded: ManagedV0DraftState = {
    ...draft,
    status: 'discarded',
    updatedAt: createInstant(),
  };
  setManagedGraphInRegistry(registry, {
    ...stateResult.value,
    drafts: new Map(stateResult.value.drafts).set(draft.draftId, discarded),
  });
  return ok({
    draftId: discarded.draftId,
    graphId: discarded.graphId,
    status: discarded.status,
    baseCommitSeq: discarded.baseCommitSeq,
    parentRevision: discarded.parentRevision,
    stagedOperationCount: discarded.operations.length,
    createdAt: discarded.createdAt,
    updatedAt: discarded.updatedAt,
  });
};

const createTransactionsHandlers = (
  registry: GraphRegistryStore,
): CanopyV0ServiceHandlers['transactions'] => ({
  commitTransaction: (request) => handleCommitTransaction(registry, request),
  createDraft: (request) => handleCreateDraft(registry, request),
  getDraft: (request) => handleGetDraft(registry, request),
  stageDraftOperations: (request) => handleStageDraftOperations(registry, request),
  commitDraft: (request) => handleCommitDraft(registry, request),
  discardDraft: (request) => handleDiscardDraft(registry, request),
});

const handleQueryNodes = async (
  registry: GraphRegistryStore,
  request: CanopyV0QueryNodesRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
  if (!consistent.ok) return consistent;
  const graph = consistent.value.graph;

  if (request.nodeId !== undefined) {
    const found = graph.nodes.get(asNodeId(request.nodeId));
    return found
      ? ok({
          graphId: request.graphId,
          appliedCommitSeq: consistent.value.commitSeq,
          nodes: [toNodeRecord(found, stateResult.value.entitySeqs)],
        })
      : err(createGraphAccessError('NOT_FOUND', `Node not found: ${request.nodeId}`));
  }

  if (request.canonicalUri !== undefined) {
    const matches = [...graph.nodes.values()].filter(
      (node) =>
        node.properties.get('canonicalUri') === request.canonicalUri ||
        node.properties.get('uri') === request.canonicalUri ||
        node.properties.get('url') === request.canonicalUri,
    );
    const limited =
      request.limit !== undefined && request.limit > 0 ? matches.slice(0, request.limit) : matches;
    return ok({
      graphId: request.graphId,
      appliedCommitSeq: consistent.value.commitSeq,
      nodes: limited.map((node) => toNodeRecord(node, stateResult.value.entitySeqs)),
    });
  }

  const steps: readonly QueryStep[] = [
    {
      kind: 'node-scan',
      ...(request.shapeId !== undefined && { shape: asShapeId(request.shapeId) }),
    },
    ...(request.limit !== undefined && request.limit > 0
      ? [{ kind: 'limit' as const, limit: request.limit }]
      : []),
  ];
  const queryResult = executeQueryEngine(graph, { steps });
  return queryResult.ok
    ? ok({
        graphId: request.graphId,
        appliedCommitSeq: consistent.value.commitSeq,
        nodes: queryResult.value.nodes.map((node) =>
          toNodeRecord(node, stateResult.value.entitySeqs),
        ),
      })
    : err(createGraphAccessError('INTERNAL_ERROR', queryResult.error.message));
};

const handleQueryEdges = async (
  registry: GraphRegistryStore,
  request: CanopyV0QueryEdgesRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
  if (!consistent.ok) return consistent;
  const graph = consistent.value.graph;

  if (request.edgeId !== undefined) {
    const found = graph.edges.get(asEdgeId(request.edgeId));
    return found
      ? ok({
          graphId: request.graphId,
          appliedCommitSeq: consistent.value.commitSeq,
          edges: [toEdgeRecord(found, stateResult.value.entitySeqs)],
        })
      : err(createGraphAccessError('NOT_FOUND', `Edge not found: ${request.edgeId}`));
  }

  const limit =
    request.limit !== undefined && request.limit > 0 ? Math.min(request.limit, 1000) : 1000;
  const edges = [...graph.edges.values()]
    .filter(
      (edge) =>
        (request.shapeId === undefined || edge.shape === request.shapeId) &&
        (request.sourceNodeId === undefined || edge.source === request.sourceNodeId) &&
        (request.targetNodeId === undefined || edge.target === request.targetNodeId),
    )
    .slice(0, limit)
    .map((edge) => toEdgeRecord(edge, stateResult.value.entitySeqs));
  return ok({ graphId: request.graphId, appliedCommitSeq: consistent.value.commitSeq, edges });
};

const handleLookupProperties = async (
  registry: GraphRegistryStore,
  request: CanopyV0LookupPropertiesRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
  if (!consistent.ok) return consistent;
  const graph = consistent.value.graph;
  const entity =
    graph.nodes.get(asNodeId(request.entityId)) ?? graph.edges.get(asEdgeId(request.entityId));
  if (!entity) {
    return err(createGraphAccessError('NOT_FOUND', `Entity not found: ${request.entityId}`));
  }
  if (request.propertyKey !== undefined) {
    const value = entity.properties.get(request.propertyKey);
    return value === undefined
      ? err(
          createGraphAccessError(
            'NOT_FOUND',
            `Property '${request.propertyKey}' not found on ${request.entityId}`,
          ),
        )
      : ok({
          graphId: request.graphId,
          appliedCommitSeq: consistent.value.commitSeq,
          entityId: request.entityId,
          properties: [{ key: request.propertyKey, valueJson: JSON.stringify(value) }],
        });
  }
  return ok({
    graphId: request.graphId,
    appliedCommitSeq: consistent.value.commitSeq,
    entityId: request.entityId,
    properties: serializePropertyEntries(entity.properties),
  });
};

const handleTraverseGraph = async (
  registry: GraphRegistryStore,
  context: GraphAccessContext,
  request: CanopyV0TraverseGraphRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  if (request.startNodeIds.length === 0) {
    return err(createGraphAccessError('VALIDATION_ERROR', 'startNodeIds must not be empty'));
  }
  const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
  if (!consistent.ok) return consistent;
  const maxDepth = Math.min(
    request.maxDepth ?? context.limits?.maxQueryDepth ?? 10,
    context.limits?.maxQueryDepth ?? 10,
  );
  const maxCost = Math.min(
    request.maxCost ?? context.limits?.maxQueryCost ?? 1000,
    context.limits?.maxQueryCost ?? 1000,
  );
  const traversal = stepBfsTraversal(
    consistent.value.graph,
    request.startNodeIds.map(asNodeId),
    request.edgeShapeId,
    request.direction ?? 'out',
    maxDepth,
    maxCost,
  );
  return traversal.ok
    ? ok({
        graphId: request.graphId,
        appliedCommitSeq: consistent.value.commitSeq,
        nodes: traversal.value.nodes.map((node) =>
          toNodeRecord(node, stateResult.value.entitySeqs),
        ),
        edges: traversal.value.edges.map((edge) =>
          toEdgeRecord(edge, stateResult.value.entitySeqs),
        ),
      })
    : traversal;
};

const handleExecuteStoredQuery = async (
  registry: GraphRegistryStore,
  request: CanopyV0ExecuteStoredQueryRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
  if (!consistent.ok) return consistent;
  const queryDefinition = getQueryDefinition(consistent.value.graph, asNodeId(request.queryNodeId));
  if (!queryDefinition.ok) {
    return err(createGraphAccessError('NOT_FOUND', queryDefinition.error.message));
  }
  const executed = executeQueryEngine(consistent.value.graph, queryDefinition.value);
  return executed.ok
    ? ok({
        graphId: request.graphId,
        queryNodeId: request.queryNodeId,
        appliedCommitSeq: consistent.value.commitSeq,
        nodes: executed.value.nodes.map((node) => toNodeRecord(node, stateResult.value.entitySeqs)),
        edges: executed.value.edges.map((edge) => toEdgeRecord(edge, stateResult.value.entitySeqs)),
      })
    : err(createGraphAccessError('INTERNAL_ERROR', executed.error.message));
};

const handleGetHistorySnapshot = async (
  registry: GraphRegistryStore,
  request: CanopyV0HistorySnapshotRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  const state = stateResult.value;
  if (request.atEventId !== undefined && state.eventLogStore) {
    const snapshotResult = await getGraphAt(state.eventLogStore, state.graphId, {
      eventId: asEventId(request.atEventId),
    });
    return snapshotResult.ok
      ? ok({
          graphId: request.graphId,
          snapshotCommitSeq: state.headCommitSeq,
          revision: snapshotResult.value.revision,
          nodes: [...snapshotResult.value.nodes.values()].map((node) =>
            toNodeRecord(node, state.entitySeqs),
          ),
          edges: [...snapshotResult.value.edges.values()].map((edge) =>
            toEdgeRecord(edge, state.entitySeqs),
          ),
        })
      : err(createGraphAccessError('INTERNAL_ERROR', snapshotResult.error.message));
  }
  const consistent = await resolveConsistentGraph(state, {
    ...(request.atCommitSeq !== undefined && { atCommitSeq: request.atCommitSeq }),
    ...(request.atTimestamp !== undefined && { atTimestamp: request.atTimestamp }),
  });
  return consistent.ok
    ? ok({
        graphId: request.graphId,
        snapshotCommitSeq: consistent.value.commitSeq,
        revision: consistent.value.graph.revision,
        nodes: [...consistent.value.graph.nodes.values()].map((node) =>
          toNodeRecord(node, state.entitySeqs),
        ),
        edges: [...consistent.value.graph.edges.values()].map((edge) =>
          toEdgeRecord(edge, state.entitySeqs),
        ),
      })
    : consistent;
};

const createQueriesHandlers = (
  registry: GraphRegistryStore,
  context: GraphAccessContext,
): CanopyV0ServiceHandlers['queries'] => ({
  queryNodes: (request) => handleQueryNodes(registry, request),
  queryEdges: (request) => handleQueryEdges(registry, request),
  lookupProperties: (request) => handleLookupProperties(registry, request),
  traverseGraph: (request) => handleTraverseGraph(registry, context, request),
  executeStoredQuery: (request) => handleExecuteStoredQuery(registry, request),
  getHistorySnapshot: (request) => handleGetHistorySnapshot(registry, request),
});

const createViewsHandlers = (registry: GraphRegistryStore): CanopyV0ServiceHandlers['views'] => ({
  resolveView: async (request: CanopyV0ResolveViewRequest) => {
    const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
    if (!stateResult.ok) return stateResult;
    const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
    if (!consistent.ok) return consistent;
    const graph = consistent.value.graph;

    const directViewNode =
      request.viewNodeId === undefined ? undefined : graph.nodes.get(asNodeId(request.viewNodeId));
    const selectedMatch = directViewNode ?? findSelectorCandidateViews(graph, request)[0]?.viewNode;
    const fallbackViewNode = selectedMatch ?? graph.nodes.get(SYSTEM_IDS.VIEW_ALL_NODES);
    if (!fallbackViewNode) {
      return err(createGraphAccessError('NOT_FOUND', 'No matching ViewDefinition found'));
    }

    const chain = followViewChain(
      graph,
      fallbackViewNode.id,
      [],
      request.maxDepth ?? DEFAULT_MAX_VIEW_DEPTH,
    );
    const terminalNode = graph.nodes.get(asNodeId(chain.terminalViewId)) ?? fallbackViewNode;
    const viewRecord = extractViewDefinitionRecord(terminalNode);
    const nodes = resolveViewNodesForDisplay(
      graph,
      viewRecord,
      request,
      stateResult.value.entitySeqs,
    );
    return ok({
      graphId: request.graphId,
      appliedCommitSeq: consistent.value.commitSeq,
      view: viewRecord,
      resolvedPathViewIds: chain.visitedPath,
      cycleDetected: chain.cycleDetected,
      leafRenderer: viewRecord.rendererPluginRef ?? viewRecord.layout,
      nodes,
    });
  },
  getViewDefinition: async (request: CanopyV0GetViewDefinitionRequest) => {
    const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
    if (!stateResult.ok) return stateResult;
    const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
    if (!consistent.ok) return consistent;
    const node = consistent.value.graph.nodes.get(asNodeId(request.viewNodeId));
    return node?.shape === SYSTEM_IDS.VIEW_DEFINITION
      ? ok(extractViewDefinitionRecord(node))
      : err(createGraphAccessError('NOT_FOUND', `ViewDefinition not found: ${request.viewNodeId}`));
  },
  resolveSetting: async (request: CanopyV0ResolveSettingRequest) => {
    const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
    if (!stateResult.ok) return stateResult;
    const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
    if (!consistent.ok) return consistent;
    const resolved = resolveSettingFromGraph(consistent.value.graph, request);
    return ok({
      graphId: request.graphId,
      appliedCommitSeq: consistent.value.commitSeq,
      key: request.key,
      resolvedScope: resolved.scope,
      ...(resolved.valueJson !== undefined && { valueJson: resolved.valueJson }),
      found: resolved.found,
    });
  },
});

const handleInstallBundle = async (
  registry: GraphRegistryStore,
  request: CanopyV0InstallBundleRequest,
) => {
  const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
  if (!stateResult.ok) return stateResult;
  if (
    request.bundle.activationKeyRequired &&
    (!request.activationKey || request.activationKey.trim().length === 0)
  ) {
    return err(
      createGraphAccessError(
        'FORBIDDEN',
        `Activation key required to install bundle ${request.bundle.bundleId}`,
      ),
    );
  }
  const currentGraph = currentGraphOf(stateResult.value);
  const installedNodeId = asNodeId(`bundle:${request.bundle.bundleId}`);
  const bundleOperation: CanopyV0BatchOperation = currentGraph.nodes.has(installedNodeId)
    ? {
        kind: 'update-node-properties',
        entityId: installedNodeId,
        properties: [
          { key: 'name', valueJson: JSON.stringify(request.bundle.name) },
          { key: 'version', valueJson: JSON.stringify(request.bundle.version) },
        ],
      }
    : {
        kind: 'create-node',
        entityId: installedNodeId,
        shapeId: asShapeId('system:nodetype:bundle'),
        properties: [
          { key: 'bundleId', valueJson: JSON.stringify(request.bundle.bundleId) },
          { key: 'name', valueJson: JSON.stringify(request.bundle.name) },
          { key: 'version', valueJson: JSON.stringify(request.bundle.version) },
        ],
      };
  const committed = await commitOperationsToGraphState(
    stateResult.value,
    [bundleOperation],
    request.provenance,
    request.precondition ?? { mode: 'unconditional' },
  );
  if (!committed.ok) return committed;
  const remainingBundles = committed.value.nextState.bundles.filter(
    (bundle) => bundle.bundleId !== request.bundle.bundleId,
  );
  setManagedGraphInRegistry(registry, {
    ...committed.value.nextState,
    bundles: [...remainingBundles, request.bundle],
  });
  return ok({
    graphId: request.graphId,
    bundleId: request.bundle.bundleId,
    commitSeq: committed.value.response.commitSeq,
    installedNodeIds: [installedNodeId],
  });
};

const createBundlesHandlers = (
  registry: GraphRegistryStore,
): CanopyV0ServiceHandlers['bundles'] => ({
  listBundles: async (request: CanopyV0ListBundlesRequest) => {
    const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
    if (!stateResult.ok) return stateResult;
    const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
    return consistent.ok
      ? ok({
          graphId: request.graphId,
          appliedCommitSeq: consistent.value.commitSeq,
          bundles: stateResult.value.bundles,
        })
      : consistent;
  },
  installBundle: (request) => handleInstallBundle(registry, request),
  getSchema: async (request: CanopyV0GetSchemaRequest) => {
    const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
    if (!stateResult.ok) return stateResult;
    const consistent = await resolveConsistentGraph(stateResult.value, request.consistency);
    return consistent.ok
      ? ok({
          graphId: request.graphId,
          appliedCommitSeq: consistent.value.commitSeq,
          propertyTypes: extractPropertyTypesFromGraph(consistent.value.graph),
          shapes: extractShapeRecordsFromGraph(consistent.value.graph),
          migrations: stateResult.value.migrations,
        })
      : consistent;
  },
  registerShapeMigration: async (request: CanopyV0RegisterShapeMigrationRequest) => {
    const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
    if (!stateResult.ok) return stateResult;
    const committed = await commitOperationsToGraphState(
      stateResult.value,
      [
        {
          kind: 'register-shape-migration',
          ...(request.migrationId !== undefined && { migrationId: request.migrationId }),
          fromShapeId: request.fromShapeId,
          toShapeId: request.toShapeId,
          transformWasmRef: request.transformWasmRef,
        },
      ],
      request.provenance,
      { mode: 'unconditional' },
    );
    if (!committed.ok) return committed;
    setManagedGraphInRegistry(registry, committed.value.nextState);
    const created = committed.value.nextState.migrations.at(-1);
    return created
      ? ok(created)
      : err(createGraphAccessError('INTERNAL_ERROR', 'Shape migration was not recorded'));
  },
});

const createStreamsHandlers = (
  registry: GraphRegistryStore,
): CanopyV0ServiceHandlers['streams'] => ({
  subscribeEvents: async (request: CanopyV0StreamSubscribeRequest) => {
    const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
    if (!stateResult.ok) return stateResult;
    const state = stateResult.value;
    const afterSeq = request.afterCommitSeq ?? 0;
    const batches = state.commitLog.filter((entry) => entry.commitSeq > afterSeq);
    const envelopes: readonly CanopyV0StreamEnvelope[] = batches.flatMap((batch) =>
      batch.events.map((event) => ({
        kind: 'event' as const,
        commitSeq: batch.commitSeq,
        eventId: event.eventId,
        eventJson: formatGraphEventJson(event),
      })),
    );
    const capacity = request.bufferCapacity ?? 1000;
    const boundedEnvelopes: readonly CanopyV0StreamEnvelope[] =
      envelopes.length > capacity
        ? [
            {
              kind: 'overflow_disconnect',
              gapCount: envelopes.length,
              reason: `Subscription buffer capacity ${capacity} exceeded`,
            },
          ]
        : envelopes;
    return ok({
      graphId: request.graphId,
      headCommitSeq: state.headCommitSeq,
      envelopes: boundedEnvelopes,
    });
  },
  replayEvents: async (request: CanopyV0StreamReplayRequest) => {
    const stateResult = getManagedGraphFromRegistry(registry, request.graphId);
    if (!stateResult.ok) return stateResult;
    const state = stateResult.value;
    const maxReplay = request.maxReplayCount ?? 1000;
    const afterSeq = request.afterCommitSeq ?? 0;
    const batches = state.commitLog.filter((entry) => entry.commitSeq > afterSeq);
    const allEnvelopes: readonly CanopyV0StreamEnvelope[] = batches.flatMap((batch) =>
      batch.events
        .filter(
          (event) =>
            request.lastSeenEventId === undefined ||
            (event.eventId as string) > request.lastSeenEventId,
        )
        .map((event) => ({
          kind: 'event' as const,
          commitSeq: batch.commitSeq,
          eventId: event.eventId,
          eventJson: formatGraphEventJson(event),
        })),
    );
    const envelopes: readonly CanopyV0StreamEnvelope[] =
      allEnvelopes.length > maxReplay
        ? [
            {
              kind: 'gap',
              gapCount: allEnvelopes.length,
              ...(request.lastSeenEventId !== undefined && {
                lastSeenEventId: request.lastSeenEventId,
              }),
              reason: `Unacknowledged event count (${allEnvelopes.length}) exceeds maxReplayCount (${maxReplay})`,
            },
          ]
        : allEnvelopes;
    return ok({
      graphId: request.graphId,
      headCommitSeq: state.headCommitSeq,
      envelopes,
    });
  },
});

export const createCanopyV0InProcessHandlers = (
  context: GraphAccessContext,
): CanopyV0ServiceHandlers => {
  const now = createInstant();
  const initialGraph = context.session ? context.session.graph() : context.graph;
  const initialState: ManagedV0GraphState = {
    graphId: initialGraph.id,
    name: initialGraph.name,
    createdAt: initialGraph.metadata.created ?? now,
    updatedAt: initialGraph.metadata.modified ?? now,
    headCommitSeq: 0,
    graph: initialGraph,
    session: context.session,
    eventLogStore: context.eventLogStore,
    entitySeqs: new Map(),
    commitLog: [],
    drafts: new Map(),
    bundles: [],
    migrations: [],
  };
  const registryCell = {
    current: new Map<string, ManagedV0GraphState>([[initialGraph.id, initialState]]) as ReadonlyMap<
      string,
      ManagedV0GraphState
    >,
  };
  const registry: GraphRegistryStore = {
    readAll: () => registryCell.current,
    writeAll: (next) => {
      registryCell.current = next;
      return next.size;
    },
  };

  return {
    graphs: createGraphsHandlers(registry),
    transactions: createTransactionsHandlers(registry),
    queries: createQueriesHandlers(registry, context),
    views: createViewsHandlers(registry),
    bundles: createBundlesHandlers(registry),
    streams: createStreamsHandlers(registry),
  };
};

const ERROR_CATEGORY_TO_STATUS: Readonly<Record<GraphAccessErrorCategory, number>> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONCURRENCY_CONFLICT: 409,
  RESOURCE_EXHAUSTED: 429,
  INTERNAL_ERROR: 500,
};

const splitPathSegments = (rawPath: string): readonly string[] =>
  rawPath
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

const parseRouteAndQuery = (
  rawPath: string,
  extraQuery: Readonly<Record<string, string | undefined>> | undefined,
): Readonly<{ pathname: string; queryMap: Readonly<Record<string, string>> }> => {
  const questionIndex = rawPath.indexOf('?');
  const pathname = questionIndex === -1 ? rawPath : rawPath.slice(0, questionIndex);
  const queryString = questionIndex === -1 ? '' : rawPath.slice(questionIndex + 1);
  const parsedPairs = [...new URLSearchParams(queryString)];
  const extraPairs = Object.entries(extraQuery ?? {}).flatMap(([key, value]) =>
    value === undefined ? [] : ([[key, value]] as const),
  );
  return {
    pathname,
    queryMap: Object.fromEntries([...parsedPairs, ...extraPairs]),
  };
};

const matchRouteDescriptor = (
  route: CanopyV0RouteDescriptor,
  method: CanopyV0HttpMethod,
  pathname: string,
): Readonly<Record<string, string>> | undefined => {
  if (route.method !== method) return undefined;
  const routeSegments = splitPathSegments(route.path);
  const pathSegments = splitPathSegments(pathname);
  if (routeSegments.length !== pathSegments.length) return undefined;

  const entries = routeSegments.map((patternSegment, index) => {
    const actualSegment = pathSegments[index];
    if (actualSegment === undefined) return undefined;
    if (patternSegment.startsWith('{') && patternSegment.endsWith('}')) {
      return [patternSegment.slice(1, -1), decodeURIComponent(actualSegment)] as const;
    }
    return patternSegment === actualSegment ? null : undefined;
  });

  if (entries.includes(undefined)) return undefined;
  const parameterPairs = entries.filter(
    (entry): entry is readonly [string, string] => entry !== null && entry !== undefined,
  );
  return Object.fromEntries(parameterPairs);
};

const parseQueryParameters = (
  queryMap: Readonly<Record<string, string>>,
): Readonly<Record<string, unknown>> => {
  const numericFields = new Set(['limit', 'expectedGraphSeq', 'atCommitSeq']);
  const consistencyFields: Readonly<Record<string, unknown>> = {
    ...(queryMap.minCommitSeq !== undefined && { minCommitSeq: Number(queryMap.minCommitSeq) }),
    ...(queryMap.atCommitSeq !== undefined && { atCommitSeq: Number(queryMap.atCommitSeq) }),
    ...(queryMap.atTimestamp !== undefined && { atTimestamp: queryMap.atTimestamp }),
    ...(queryMap.linearizable !== undefined && {
      linearizable: queryMap.linearizable === 'true',
    }),
  };

  const baseEntries = Object.entries(queryMap)
    .filter(([key]) => key !== 'minCommitSeq' && key !== 'linearizable')
    .map(([key, value]) => [key, numericFields.has(key) ? Number(value) : value] as const);

  return {
    ...Object.fromEntries(baseEntries),
    ...(Object.keys(consistencyFields).length > 0 && { consistency: consistencyFields }),
  };
};

const dispatchRouteOperation = (
  handlers: CanopyV0ServiceHandlers,
  route: CanopyV0RouteDescriptor,
  payload: unknown,
): Promise<GraphAccessResponse<unknown>> => {
  const input = payload as never;
  switch (route.id) {
    case 'Graphs.listGraphs': {
      return handlers.graphs.listGraphs(input);
    }
    case 'Graphs.createGraph': {
      return handlers.graphs.createGraph(input);
    }
    case 'Graphs.getGraph': {
      return handlers.graphs.getGraph(input);
    }
    case 'Graphs.deleteGraph': {
      return handlers.graphs.deleteGraph(input);
    }
    case 'Transactions.commitTransaction': {
      return handlers.transactions.commitTransaction(input);
    }
    case 'Transactions.createDraft': {
      return handlers.transactions.createDraft(input);
    }
    case 'Transactions.getDraft': {
      return handlers.transactions.getDraft(input);
    }
    case 'Transactions.stageDraftOperations': {
      return handlers.transactions.stageDraftOperations(input);
    }
    case 'Transactions.commitDraft': {
      return handlers.transactions.commitDraft(input);
    }
    case 'Transactions.discardDraft': {
      return handlers.transactions.discardDraft(input);
    }
    case 'Queries.queryNodes': {
      return handlers.queries.queryNodes(input);
    }
    case 'Queries.queryEdges': {
      return handlers.queries.queryEdges(input);
    }
    case 'Queries.lookupProperties': {
      return handlers.queries.lookupProperties(input);
    }
    case 'Queries.traverseGraph': {
      return handlers.queries.traverseGraph(input);
    }
    case 'Queries.executeStoredQuery': {
      return handlers.queries.executeStoredQuery(input);
    }
    case 'Queries.getHistorySnapshot': {
      return handlers.queries.getHistorySnapshot(input);
    }
    case 'Views.resolveView': {
      return handlers.views.resolveView(input);
    }
    case 'Views.getViewDefinition': {
      return handlers.views.getViewDefinition(input);
    }
    case 'Views.resolveSetting': {
      return handlers.views.resolveSetting(input);
    }
    case 'Bundles.listBundles': {
      return handlers.bundles.listBundles(input);
    }
    case 'Bundles.installBundle': {
      return handlers.bundles.installBundle(input);
    }
    case 'Bundles.getSchema': {
      return handlers.bundles.getSchema(input);
    }
    case 'Bundles.registerShapeMigration': {
      return handlers.bundles.registerShapeMigration(input);
    }
    case 'Streams.subscribeEvents': {
      return handlers.streams.subscribeEvents(input);
    }
    case 'Streams.replayEvents': {
      return handlers.streams.replayEvents(input);
    }
  }
};

export const createCanopyV0ServerRouter = (
  handlers: CanopyV0ServiceHandlers,
): CanopyV0ServerRouter => ({
  dispatch: async (request: CanopyV0RouteRequest): Promise<CanopyV0RouteResponse> => {
    const { pathname, queryMap } = parseRouteAndQuery(request.path, request.query);
    const matched = CANOPY_V0_ROUTES.map((route) => {
      const pathParameters = matchRouteDescriptor(route, request.method, pathname);
      return pathParameters === undefined ? undefined : { route, pathParameters };
    }).find(
      (
        candidate,
      ): candidate is Readonly<{
        route: CanopyV0RouteDescriptor;
        pathParameters: Readonly<Record<string, string>>;
      }> => candidate !== undefined,
    );

    if (!matched) {
      return {
        status: 404,
        body: err(
          createGraphAccessError('NOT_FOUND', `Route not found: ${request.method} ${pathname}`),
        ),
      };
    }

    const parsedQuery = parseQueryParameters(queryMap);
    const bodyObject = isRecordObject(request.body) ? request.body : {};
    const mergedPayload = {
      ...parsedQuery,
      ...bodyObject,
      ...matched.pathParameters,
    };
    const result = await dispatchRouteOperation(handlers, matched.route, mergedPayload);
    const status = result.ok ? 200 : ERROR_CATEGORY_TO_STATUS[result.error.category];
    return { status, body: result };
  },
});
