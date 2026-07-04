import type { Graph } from './graph';
import type { GraphEvent } from './events';
import type { GraphId, DeviceId, NodeId, EdgeId } from './identifiers';
import type { EventLogStore } from './event-log';
import type { Result } from './result';
import { ok, err, unwrap } from './result';
import { createGraph } from './create-graph';
import { projectGraph } from './projection';
import { mergeEvents, createMergeState, type MergeState } from './incremental-projection';
import { validateNode, validateEdge } from './validation';

export interface GraphSessionDelta {
  readonly applied: readonly GraphEvent[];
}

// eslint-disable-next-line functional/no-return-void
export type GraphChangeHandler = (graph: Graph, delta: GraphSessionDelta) => void;

export interface GraphSession {
  /** Reads the full event log and (re)projects it as the session's current graph. */
  readonly load: () => Promise<Result<Graph, Error>>;
  /**
   * Validates, appends, and merges a set of events as one atomic commit.
   * Events are stamped with the session's own deviceId regardless of what
   * they already carry. On validation failure, nothing is appended and the
   * projected graph is unchanged.
   */
  readonly commit: (events: readonly GraphEvent[]) => Promise<Result<Graph, Error>>;
  /** The session's current projected graph (bootstrap-only if load() hasn't run yet). */
  readonly graph: () => Graph;
  // eslint-disable-next-line functional/no-return-void
  readonly subscribe: (handler: GraphChangeHandler) => () => void;
}

const SESSION_GRAPH_NAME = 'graph';

/**
 * Structural + referential + type validation for a candidate commit.
 * Referential/structural checks reuse the canonical fold directly (a dry-run
 * projectGraph against the pre-commit graph rejects duplicate ids and
 * dangling references exactly as commit needs); type checks then run
 * validateNode/validateEdge against the entities the dry run produced.
 */
function validateCommit(graph: Graph, events: readonly GraphEvent[]): Result<void, Error> {
  const dryRun = projectGraph(events, graph);
  if (!dryRun.ok) return dryRun;
  const dryRunGraph = dryRun.value;

  const touchedNodeIds = new Set<NodeId>();
  const touchedEdgeIds = new Set<EdgeId>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const event of events) {
    if (event.type === 'NodeCreated' || event.type === 'NodePropertiesUpdated') {
      // eslint-disable-next-line functional/immutable-data
      touchedNodeIds.add(event.id);
    }
    if (event.type === 'EdgeCreated' || event.type === 'EdgePropertiesUpdated') {
      // eslint-disable-next-line functional/immutable-data
      touchedEdgeIds.add(event.id);
    }
  }

  // eslint-disable-next-line functional/no-loop-statements
  for (const id of touchedNodeIds) {
    const node = dryRunGraph.nodes.get(id);
    if (!node) continue; // deleted later within the same commit
    const result = validateNode(dryRunGraph, node);
    if (!result.valid) {
      const detail = result.errors.map((e) => e.message).join(', ');
      return err(new Error(`Node ${id} failed validation: ${detail}`));
    }
  }

  // eslint-disable-next-line functional/no-loop-statements
  for (const id of touchedEdgeIds) {
    const edge = dryRunGraph.edges.get(id);
    if (!edge) continue;
    const result = validateEdge(dryRunGraph, edge);
    if (!result.valid) {
      const detail = result.errors.map((e) => e.message).join(', ');
      return err(new Error(`Edge ${id} failed validation: ${detail}`));
    }
  }

  return ok(undefined);
}

/**
 * The single write path for a graph: op events flow through
 * validate -> EventLogStore append -> incremental projection -> subscriber
 * notification. See openspec/changes/event-log-source-of-truth/specs/graph-session.
 */
export function createGraphSession(
  eventLog: EventLogStore,
  graphId: GraphId,
  deviceId: DeviceId,
): GraphSession {
  // eslint-disable-next-line functional/no-let
  let mergeState: MergeState = createMergeState();
  // eslint-disable-next-line functional/no-let
  let currentGraph: Graph = unwrap(createGraph(graphId, SESSION_GRAPH_NAME));
  // eslint-disable-next-line functional/no-let
  let subscribers: ReadonlySet<GraphChangeHandler> = new Set();

  // eslint-disable-next-line functional/no-return-void
  const notify = (graph: Graph, applied: readonly GraphEvent[]): void => {
    if (applied.length === 0) return;
    const delta: GraphSessionDelta = { applied };
    // eslint-disable-next-line functional/no-loop-statements
    for (const handler of subscribers) {
      handler(graph, delta);
    }
  };

  const load = async (): Promise<Result<Graph, Error>> => {
    const initial = createGraph(graphId, SESSION_GRAPH_NAME);
    if (!initial.ok) return initial;

    const eventsResult = await eventLog.getEvents(graphId);
    if (!eventsResult.ok) return eventsResult;

    const merged = mergeEvents(createMergeState(), initial.value, eventsResult.value);
    mergeState = merged.state;
    currentGraph = merged.graph;
    return ok(merged.graph);
  };

  const commit = async (events: readonly GraphEvent[]): Promise<Result<Graph, Error>> => {
    if (events.length === 0) {
      return ok(currentGraph);
    }

    const stamped = events.map((event) => ({ ...event, deviceId }) as GraphEvent);

    const validation = validateCommit(currentGraph, stamped);
    if (!validation.ok) return validation;

    const appendResult = await eventLog.appendEvents(graphId, stamped);
    if (!appendResult.ok) return appendResult;

    const merged = mergeEvents(mergeState, currentGraph, stamped);
    mergeState = merged.state;
    currentGraph = merged.graph;
    notify(merged.graph, merged.applied);

    return ok(merged.graph);
  };

  // eslint-disable-next-line functional/no-return-void
  const subscribe = (handler: GraphChangeHandler): (() => void) => {
    // eslint-disable-next-line functional/no-return-void, functional/prefer-tacit
    const wrapped: GraphChangeHandler = (graph, delta) => handler(graph, delta);
    const next = new Set(subscribers);
    // eslint-disable-next-line functional/immutable-data
    next.add(wrapped);
    subscribers = next;

    // eslint-disable-next-line functional/no-return-void
    return () => {
      const remaining = new Set(subscribers);
      // eslint-disable-next-line functional/immutable-data
      remaining.delete(wrapped);
      subscribers = remaining;
    };
  };

  return {
    load,
    commit,
    graph: () => currentGraph,
    subscribe,
  };
}
