import type { Graph } from './graph';
import type { GraphEvent } from './events';
import type { Node } from './node';
import type { Edge } from './edge';
import type { NodeId, EdgeId, EventId } from './identifiers';
import type { Instant } from './temporal';
import { Temporal } from 'temporal-polyfill';
import { lwwWins } from './projection';

/**
 * Per-entity merge bookkeeping: which event last wrote each property
 * (removals count as writes), and whether the entity is permanently
 * tombstoned. Display metadata (modified/modifiedBy) lives on the Node/Edge
 * itself in the graph and is kept in sync via the same lwwWins comparator
 * canonical projection uses, so it converges to the identical value.
 */
interface EntityMergeMeta {
  readonly exists: boolean;
  readonly tombstoned: boolean;
  readonly propertyWriters: ReadonlyMap<string, EventId>;
}

function emptyMeta(): EntityMergeMeta {
  return { exists: false, tombstoned: false, propertyWriters: new Map() };
}

/** A batchId group (or a singleton for events with no batchId) parked on an unmet dependency. */
interface PendingGroup {
  readonly id: number;
  readonly events: readonly GraphEvent[];
  readonly firstSeenEventId: EventId;
}

export interface MergeState {
  readonly nodeMeta: ReadonlyMap<NodeId, EntityMergeMeta>;
  readonly edgeMeta: ReadonlyMap<EdgeId, EntityMergeMeta>;
  readonly pendingGroups: ReadonlyMap<number, PendingGroup>;
  readonly pendingByDependency: ReadonlyMap<string, ReadonlySet<number>>;
  readonly nextPendingId: number;
}

export function createMergeState(): MergeState {
  return {
    nodeMeta: new Map(),
    edgeMeta: new Map(),
    pendingGroups: new Map(),
    pendingByDependency: new Map(),
    nextPendingId: 0,
  };
}

export interface StalePendingWarning {
  readonly dependencyKey: string;
  readonly eventIds: readonly EventId[];
  readonly ageMs: number;
}

export interface MergeResult {
  readonly state: MergeState;
  readonly graph: Graph;
  /** Events actually applied to the graph by this call, including any drained pending groups. */
  readonly applied: readonly GraphEvent[];
  readonly stale: readonly StalePendingWarning[];
}

export const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

/** Decodes the 48-bit unix-ms timestamp embedded in a UUIDv7 eventId. Inverse of history.ts's encoding. */
export function epochMsFromEventId(eventId: EventId): number {
  const hex = eventId.replaceAll('-', '').slice(0, 12);
  return Number.parseInt(hex, 16);
}

function dependencyKeysFor(event: GraphEvent): readonly string[] {
  switch (event.type) {
    case 'NodeCreated': {
      return [];
    }
    case 'NodePropertiesUpdated':
    case 'NodeDeleted': {
      return [`node:${event.id}`];
    }
    case 'EdgeCreated': {
      return [`node:${event.source}`, `node:${event.target}`];
    }
    case 'EdgePropertiesUpdated':
    case 'EdgeDeleted': {
      return [`edge:${event.id}`];
    }
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return [];
    }
    default: {
      return [];
    }
  }
}

interface ApplyOutcome {
  readonly graph: Graph;
  readonly nodeMeta: ReadonlyMap<NodeId, EntityMergeMeta>;
  readonly edgeMeta: ReadonlyMap<EdgeId, EntityMergeMeta>;
}

/**
 * Graph-level metadata.modified/modifiedBy mirrors canonical projection
 * exactly: replace-if-wins against whatever is already there. Because this is
 * a plain running max over (timestamp, deviceId) pairs, it converges
 * regardless of application order -- and correctly seeds from the incoming
 * graph's own pre-existing metadata (e.g. from bootstrap), not from a
 * merge-local marker.
 */
function touchGraphMetadata(
  graph: Graph,
  event: GraphEvent,
  nodes: ReadonlyMap<NodeId, Node>,
  edges: ReadonlyMap<EdgeId, Edge>,
): Graph {
  const wins = lwwWins(
    event.timestamp,
    event.deviceId,
    graph.metadata.modified,
    graph.metadata.modifiedBy,
  );
  return {
    ...graph,
    nodes,
    edges,
    metadata: wins
      ? { ...graph.metadata, modified: event.timestamp, modifiedBy: event.deviceId }
      : graph.metadata,
  };
}

/**
 * Applies a single event against working (graph, nodeMeta, edgeMeta), assuming
 * its dependencies are already satisfied. Pure function, no mutation.
 */
// eslint-disable-next-line max-lines-per-function
function applyOneEvent(
  graph: Graph,
  nodeMeta: ReadonlyMap<NodeId, EntityMergeMeta>,
  edgeMeta: ReadonlyMap<EdgeId, EntityMergeMeta>,
  event: GraphEvent,
): ApplyOutcome {
  switch (event.type) {
    case 'NodeCreated': {
      const meta = nodeMeta.get(event.id) ?? emptyMeta();
      if (meta.tombstoned || meta.exists) {
        // Already deleted (arrived out of order) or duplicate create: no-op.
        return { graph, nodeMeta, edgeMeta };
      }

      const propertyWriters = new Map<string, EventId>();
      // eslint-disable-next-line functional/no-loop-statements
      for (const key of event.properties.keys()) {
        // eslint-disable-next-line functional/immutable-data
        propertyWriters.set(key, event.eventId);
      }

      const node: Node = {
        id: event.id,
        type: event.nodeType,
        properties: event.properties,
        metadata: {
          created: event.timestamp,
          modified: event.timestamp,
          modifiedBy: event.deviceId,
        },
      };

      const newNodes = new Map(graph.nodes);
      // eslint-disable-next-line functional/immutable-data
      newNodes.set(node.id, node);
      const newNodeMeta = new Map(nodeMeta);
      // eslint-disable-next-line functional/immutable-data
      newNodeMeta.set(event.id, { exists: true, tombstoned: false, propertyWriters });

      return {
        graph: touchGraphMetadata(graph, event, newNodes, graph.edges),
        nodeMeta: newNodeMeta,
        edgeMeta,
      };
    }

    case 'NodePropertiesUpdated': {
      const meta = nodeMeta.get(event.id);
      const node = graph.nodes.get(event.id);
      if (!meta || !meta.exists || meta.tombstoned || !node) {
        return { graph, nodeMeta, edgeMeta };
      }

      const propertyWriters = new Map(meta.propertyWriters);
      const properties = new Map(node.properties);
      // eslint-disable-next-line functional/no-loop-statements
      for (const [key, value] of event.changes) {
        const writer = propertyWriters.get(key);
        if (writer === undefined || event.eventId > writer) {
          // eslint-disable-next-line functional/immutable-data
          properties.set(key, value);
          // eslint-disable-next-line functional/immutable-data
          propertyWriters.set(key, event.eventId);
        }
      }

      const touchWins = lwwWins(
        event.timestamp,
        event.deviceId,
        node.metadata.modified,
        node.metadata.modifiedBy,
      );

      const updatedNode: Node = {
        ...node,
        properties,
        metadata: touchWins
          ? { ...node.metadata, modified: event.timestamp, modifiedBy: event.deviceId }
          : node.metadata,
      };

      const newNodes = new Map(graph.nodes);
      // eslint-disable-next-line functional/immutable-data
      newNodes.set(event.id, updatedNode);
      const newNodeMeta = new Map(nodeMeta);
      // eslint-disable-next-line functional/immutable-data
      newNodeMeta.set(event.id, { ...meta, propertyWriters });

      return {
        graph: touchGraphMetadata(graph, event, newNodes, graph.edges),
        nodeMeta: newNodeMeta,
        edgeMeta,
      };
    }

    case 'NodeDeleted': {
      const meta = nodeMeta.get(event.id);
      if (!meta || !meta.exists || meta.tombstoned) {
        return { graph, nodeMeta, edgeMeta };
      }

      const newNodes = new Map(graph.nodes);
      // eslint-disable-next-line functional/immutable-data
      newNodes.delete(event.id);
      const newNodeMeta = new Map(nodeMeta);
      // eslint-disable-next-line functional/immutable-data
      newNodeMeta.set(event.id, { ...meta, tombstoned: true });

      // Cascade: remove and tombstone every edge touching this node.
      const touchingEdges = [...graph.edges.values()].filter(
        (edge) => edge.source === event.id || edge.target === event.id,
      );
      const newEdges = new Map(graph.edges);
      const newEdgeMeta = new Map(edgeMeta);
      // eslint-disable-next-line functional/no-loop-statements
      for (const edge of touchingEdges) {
        // eslint-disable-next-line functional/immutable-data
        newEdges.delete(edge.id);
        const existingEdgeMeta = newEdgeMeta.get(edge.id) ?? emptyMeta();
        // eslint-disable-next-line functional/immutable-data
        newEdgeMeta.set(edge.id, { ...existingEdgeMeta, tombstoned: true });
      }

      return {
        graph: touchGraphMetadata(graph, event, newNodes, newEdges),
        nodeMeta: newNodeMeta,
        edgeMeta: newEdgeMeta,
      };
    }

    case 'EdgeCreated': {
      const meta = edgeMeta.get(event.id) ?? emptyMeta();
      if (meta.tombstoned || meta.exists) {
        return { graph, nodeMeta, edgeMeta };
      }
      // Defensive: dependency tracking only proves the endpoints were ever
      // created, not that they are still live. A dangling reference here
      // means the endpoint was deleted before this (out-of-order) arrival --
      // not a case the property-based test generates, but never produce a
      // graph with an edge pointing at a missing node.
      if (!graph.nodes.has(event.source) || !graph.nodes.has(event.target)) {
        return { graph, nodeMeta, edgeMeta };
      }

      const propertyWriters = new Map<string, EventId>();
      // eslint-disable-next-line functional/no-loop-statements
      for (const key of event.properties.keys()) {
        // eslint-disable-next-line functional/immutable-data
        propertyWriters.set(key, event.eventId);
      }

      const edge: Edge = {
        id: event.id,
        type: event.edgeType,
        source: event.source,
        target: event.target,
        properties: event.properties,
        metadata: {
          created: event.timestamp,
          modified: event.timestamp,
          modifiedBy: event.deviceId,
        },
      };

      const newEdges = new Map(graph.edges);
      // eslint-disable-next-line functional/immutable-data
      newEdges.set(edge.id, edge);
      const newEdgeMeta = new Map(edgeMeta);
      // eslint-disable-next-line functional/immutable-data
      newEdgeMeta.set(event.id, { exists: true, tombstoned: false, propertyWriters });

      return {
        graph: touchGraphMetadata(graph, event, graph.nodes, newEdges),
        nodeMeta,
        edgeMeta: newEdgeMeta,
      };
    }

    case 'EdgePropertiesUpdated': {
      const meta = edgeMeta.get(event.id);
      const edge = graph.edges.get(event.id);
      if (!meta || !meta.exists || meta.tombstoned || !edge) {
        return { graph, nodeMeta, edgeMeta };
      }

      const propertyWriters = new Map(meta.propertyWriters);
      const properties = new Map(edge.properties);
      // eslint-disable-next-line functional/no-loop-statements
      for (const [key, value] of event.changes) {
        const writer = propertyWriters.get(key);
        if (writer === undefined || event.eventId > writer) {
          // eslint-disable-next-line functional/immutable-data
          properties.set(key, value);
          // eslint-disable-next-line functional/immutable-data
          propertyWriters.set(key, event.eventId);
        }
      }

      const touchWins = lwwWins(
        event.timestamp,
        event.deviceId,
        edge.metadata.modified,
        edge.metadata.modifiedBy,
      );

      const updatedEdge: Edge = {
        ...edge,
        properties,
        metadata: touchWins
          ? { ...edge.metadata, modified: event.timestamp, modifiedBy: event.deviceId }
          : edge.metadata,
      };

      const newEdges = new Map(graph.edges);
      // eslint-disable-next-line functional/immutable-data
      newEdges.set(event.id, updatedEdge);
      const newEdgeMeta = new Map(edgeMeta);
      // eslint-disable-next-line functional/immutable-data
      newEdgeMeta.set(event.id, { ...meta, propertyWriters });

      return {
        graph: touchGraphMetadata(graph, event, graph.nodes, newEdges),
        nodeMeta,
        edgeMeta: newEdgeMeta,
      };
    }

    case 'EdgeDeleted': {
      const meta = edgeMeta.get(event.id);
      if (!meta || !meta.exists || meta.tombstoned) {
        return { graph, nodeMeta, edgeMeta };
      }

      const newEdges = new Map(graph.edges);
      // eslint-disable-next-line functional/immutable-data
      newEdges.delete(event.id);
      const newEdgeMeta = new Map(edgeMeta);
      // eslint-disable-next-line functional/immutable-data
      newEdgeMeta.set(event.id, { ...meta, tombstoned: true });

      return {
        graph: touchGraphMetadata(graph, event, graph.nodes, newEdges),
        nodeMeta,
        edgeMeta: newEdgeMeta,
      };
    }

    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return { graph, nodeMeta, edgeMeta };
    }
    default: {
      return { graph, nodeMeta, edgeMeta };
    }
  }
}

function dependenciesSatisfied(
  events: readonly GraphEvent[],
  nodeMeta: ReadonlyMap<NodeId, EntityMergeMeta>,
  edgeMeta: ReadonlyMap<EdgeId, EntityMergeMeta>,
  createdInGroup: ReadonlySet<string>,
): readonly string[] {
  const unmet = new Set<string>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const event of events) {
    // eslint-disable-next-line functional/no-loop-statements
    for (const key of dependencyKeysFor(event)) {
      if (createdInGroup.has(key)) continue;
      const separatorIndex = key.indexOf(':');
      const kind = key.slice(0, separatorIndex);
      const id = key.slice(separatorIndex + 1);
      const satisfied =
        kind === 'node'
          ? (nodeMeta.get(id as NodeId)?.exists ?? false)
          : (edgeMeta.get(id as EdgeId)?.exists ?? false);
      if (!satisfied) {
        // eslint-disable-next-line functional/immutable-data
        unmet.add(key);
      }
    }
  }
  return [...unmet];
}

function groupEvents(events: readonly GraphEvent[]): readonly (readonly GraphEvent[])[] {
  const byKey = new Map<string, GraphEvent[]>();
  // eslint-disable-next-line functional/no-let
  let singletonCounter = 0;
  // eslint-disable-next-line functional/no-loop-statements
  for (const event of events) {
    singletonCounter += 1;
    const key =
      event.batchId === undefined ? `single:${singletonCounter}` : `batch:${event.batchId}`;
    const existing = byKey.get(key);
    if (existing) {
      // eslint-disable-next-line functional/immutable-data
      existing.push(event);
    } else {
      // eslint-disable-next-line functional/immutable-data
      byKey.set(key, [event]);
    }
  }
  return [...byKey.values()];
}

interface GroupAttempt {
  readonly applied: boolean;
  readonly graph: Graph;
  readonly nodeMeta: ReadonlyMap<NodeId, EntityMergeMeta>;
  readonly edgeMeta: ReadonlyMap<EdgeId, EntityMergeMeta>;
  readonly unmet: readonly string[];
}

/**
 * Attempts to apply a co-batched group of events atomically: either every
 * event in the group applies (in ascending eventId order, so intra-group
 * forward references like NodeCreated -> EdgeCreated resolve), or none do and
 * the whole group parks under its unmet dependencies.
 */
function attemptGroup(
  graph: Graph,
  nodeMeta: ReadonlyMap<NodeId, EntityMergeMeta>,
  edgeMeta: ReadonlyMap<EdgeId, EntityMergeMeta>,
  events: readonly GraphEvent[],
): GroupAttempt {
  const sorted = [...events].toSorted((a, b) => a.eventId.localeCompare(b.eventId));

  const createdInGroup = new Set<string>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const event of sorted) {
    if (event.type === 'NodeCreated') {
      // eslint-disable-next-line functional/immutable-data
      createdInGroup.add(`node:${event.id}`);
    } else if (event.type === 'EdgeCreated') {
      // eslint-disable-next-line functional/immutable-data
      createdInGroup.add(`edge:${event.id}`);
    }
  }

  const unmet = dependenciesSatisfied(sorted, nodeMeta, edgeMeta, createdInGroup);
  if (unmet.length > 0) {
    return { applied: false, graph, nodeMeta, edgeMeta, unmet };
  }

  // eslint-disable-next-line functional/no-let
  let workingGraph = graph;
  // eslint-disable-next-line functional/no-let
  let workingNodeMeta = nodeMeta;
  // eslint-disable-next-line functional/no-let
  let workingEdgeMeta = edgeMeta;
  // eslint-disable-next-line functional/no-loop-statements
  for (const event of sorted) {
    const result = applyOneEvent(workingGraph, workingNodeMeta, workingEdgeMeta, event);
    workingGraph = result.graph;
    workingNodeMeta = result.nodeMeta;
    workingEdgeMeta = result.edgeMeta;
  }

  return {
    applied: true,
    graph: workingGraph,
    nodeMeta: workingNodeMeta,
    edgeMeta: workingEdgeMeta,
    unmet: [],
  };
}

function registerPending(
  state: MergeState,
  group: PendingGroup,
  keys: readonly string[],
): MergeState {
  const pendingGroups = new Map(state.pendingGroups);
  // eslint-disable-next-line functional/immutable-data
  pendingGroups.set(group.id, group);

  const pendingByDependency = new Map(state.pendingByDependency);
  // eslint-disable-next-line functional/no-loop-statements
  for (const key of keys) {
    const existing = new Set(pendingByDependency.get(key));
    // eslint-disable-next-line functional/immutable-data
    existing.add(group.id);
    // eslint-disable-next-line functional/immutable-data
    pendingByDependency.set(key, existing);
  }

  return { ...state, pendingGroups, pendingByDependency };
}

function removePendingGroup(state: MergeState, groupId: number): MergeState {
  const pendingGroups = new Map(state.pendingGroups);
  // eslint-disable-next-line functional/immutable-data
  pendingGroups.delete(groupId);

  const pendingByDependency = new Map<string, ReadonlySet<number>>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const [key, ids] of state.pendingByDependency) {
    const filtered = new Set([...ids].filter((id) => id !== groupId));
    if (filtered.size > 0) {
      // eslint-disable-next-line functional/immutable-data
      pendingByDependency.set(key, filtered);
    }
  }

  return { ...state, pendingGroups, pendingByDependency };
}

/**
 * Merges a set of events (typically one commit or one ingest chunk) into the
 * current (state, graph), applying eagerly where possible and parking events
 * whose dependencies are not yet satisfied. Draining previously-parked groups
 * that this call's new entities unblock is handled transitively.
 *
 * Convergence invariant: for any partition of a valid event set E into calls,
 * in any order, repeated application of this function reaches the same graph
 * as `projectGraph(sort(E), initialGraph)`.
 */
// eslint-disable-next-line max-lines-per-function
export function mergeEvents(
  state: MergeState,
  graph: Graph,
  events: readonly GraphEvent[],
  now: Instant = Temporal.Now.instant().toString() as Instant,
): MergeResult {
  const groups = groupEvents(events);

  // eslint-disable-next-line functional/no-let
  let workingState = state;
  // eslint-disable-next-line functional/no-let
  let workingGraph = graph;
  // eslint-disable-next-line functional/prefer-immutable-types
  const applied: GraphEvent[] = [];
  // eslint-disable-next-line functional/prefer-immutable-types
  const readyQueue: string[] = [];

  // eslint-disable-next-line functional/no-return-void
  const tryApply = (candidateEvents: readonly GraphEvent[], pendingGroupId?: number): void => {
    const attempt = attemptGroup(
      workingGraph,
      workingState.nodeMeta,
      workingState.edgeMeta,
      candidateEvents,
    );
    if (attempt.applied) {
      workingGraph = attempt.graph;
      workingState = {
        ...workingState,
        nodeMeta: attempt.nodeMeta,
        edgeMeta: attempt.edgeMeta,
      };
      if (pendingGroupId !== undefined) {
        workingState = removePendingGroup(workingState, pendingGroupId);
      }
      // eslint-disable-next-line functional/no-loop-statements
      for (const event of candidateEvents) {
        // eslint-disable-next-line functional/immutable-data
        applied.push(event);
        if (event.type === 'NodeCreated') {
          // eslint-disable-next-line functional/immutable-data
          readyQueue.push(`node:${event.id}`);
        } else if (event.type === 'EdgeCreated') {
          // eslint-disable-next-line functional/immutable-data
          readyQueue.push(`edge:${event.id}`);
        }
      }
      return;
    }

    const firstEvent = candidateEvents[0];
    if (firstEvent === undefined) return;
    // eslint-disable-next-line functional/no-let
    let firstSeenEventId = firstEvent.eventId;
    // eslint-disable-next-line functional/no-loop-statements
    for (const e of candidateEvents) {
      if (e.eventId < firstSeenEventId) {
        firstSeenEventId = e.eventId;
      }
    }
    const groupId = pendingGroupId ?? workingState.nextPendingId;
    if (pendingGroupId === undefined) {
      workingState = { ...workingState, nextPendingId: workingState.nextPendingId + 1 };
    }
    workingState = registerPending(
      workingState,
      { id: groupId, events: candidateEvents, firstSeenEventId },
      attempt.unmet,
    );
  };

  // eslint-disable-next-line functional/no-loop-statements
  for (const group of groups) {
    tryApply(group);
  }

  // Drain: newly-ready dependency keys may unblock previously-pending groups
  // (including ones parked before this call).
  // eslint-disable-next-line functional/no-loop-statements
  while (readyQueue.length > 0) {
    // eslint-disable-next-line functional/immutable-data
    const key = readyQueue.shift();
    if (key === undefined) break;
    const groupIds = [...(workingState.pendingByDependency.get(key) ?? [])];
    // eslint-disable-next-line functional/no-loop-statements
    for (const groupId of groupIds) {
      const group = workingState.pendingGroups.get(groupId);
      if (!group) continue;
      // Removed here; tryApply will re-register under any still-unmet keys.
      workingState = removePendingGroup(workingState, groupId);
      tryApply(group.events, groupId);
    }
  }

  const nowMs = Temporal.Instant.from(now).epochMilliseconds;
  const dependencyKeysByGroup = new Map<number, string[]>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const [key, ids] of workingState.pendingByDependency) {
    // eslint-disable-next-line functional/no-loop-statements
    for (const id of ids) {
      const keys = dependencyKeysByGroup.get(id);
      if (keys) {
        // eslint-disable-next-line functional/immutable-data
        keys.push(key);
      } else {
        // eslint-disable-next-line functional/immutable-data
        dependencyKeysByGroup.set(id, [key]);
      }
    }
  }

  // eslint-disable-next-line functional/prefer-immutable-types
  const stale: StalePendingWarning[] = [];
  // eslint-disable-next-line functional/no-loop-statements
  for (const [groupId, keys] of dependencyKeysByGroup) {
    const group = workingState.pendingGroups.get(groupId);
    if (!group) continue;
    const ageMs = nowMs - epochMsFromEventId(group.firstSeenEventId);
    if (ageMs >= DEFAULT_STALE_THRESHOLD_MS) {
      // eslint-disable-next-line functional/immutable-data
      stale.push({
        dependencyKey: keys.join(','),
        eventIds: group.events.map((e) => e.eventId),
        ageMs,
      });
    }
  }

  return { state: workingState, graph: workingGraph, applied, stale };
}
