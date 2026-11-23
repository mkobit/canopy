import type { Graph } from './graph';
import type { GraphEvent } from './events';
import type { Node } from './node';
import type { Edge } from './edge';
import type { Result } from './result';
import type { Instant, TemporalMetadata } from './temporal';
import type { DeviceId } from './identifiers';
import type { HlcTimestamp } from './hlc';
import { compareHlcTimestamp, synthesizeLegacyHlc } from './hlc';
import { ok, err as error, fromThrowable, unwrap } from './result';
import { incrementalUpdateIndexes } from './indexes';
import { accumulateRevision } from './revision';

export interface LwwStamp {
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly hlcTimestamp?: HlcTimestamp | undefined;
}

/**
Returns true if the incoming stamp should win over the current stamp.
Compares effective HLC timestamps (synthesizing from `(timestamp, deviceId)`
for legacy events) with `deviceId` as tiebreaker.
*/
export function lwwWins(incoming: LwwStamp, current: LwwStamp): boolean {
  if (incoming.hlcTimestamp === undefined && current.hlcTimestamp === undefined) {
    return incoming.timestamp === current.timestamp
      ? incoming.deviceId >= current.deviceId
      : incoming.timestamp > current.timestamp;
  }
  const incomingHlc =
    incoming.hlcTimestamp ?? synthesizeLegacyHlc(incoming.timestamp, incoming.deviceId);
  const currentHlc =
    current.hlcTimestamp ?? synthesizeLegacyHlc(current.timestamp, current.deviceId);
  const cmp = compareHlcTimestamp(incomingHlc, currentHlc);
  return cmp === 0 ? incoming.deviceId >= current.deviceId : cmp > 0;
}

function stampFromEvent(event: GraphEvent): LwwStamp {
  return {
    timestamp: event.timestamp,
    deviceId: event.deviceId,
    hlcTimestamp: event.hlcTimestamp,
  };
}

function stampFromMetadata(metadata: TemporalMetadata): LwwStamp {
  return {
    timestamp: metadata.modified,
    deviceId: metadata.modifiedBy,
    hlcTimestamp: metadata.hlcTimestamp,
  };
}

function advanceMetadata(current: TemporalMetadata, event: GraphEvent): TemporalMetadata {
  if (!lwwWins(stampFromEvent(event), stampFromMetadata(current))) {
    return current;
  }
  return {
    ...current,
    modified: event.timestamp,
    modifiedBy: event.deviceId,
    ...(event.hlcTimestamp !== undefined && { hlcTimestamp: event.hlcTimestamp }),
  };
}

/**
Applies a single event to the graph, returning a new graph state.
This function is pure and does not mutate the input graph.
*/

// eslint-disable-next-line max-lines-per-function
export function applyEvent(graph: Graph, event: GraphEvent): Result<Graph, Error> {
  const result = unwrap(
    fromThrowable(
      // eslint-disable-next-line max-lines-per-function
      () => {
        switch (event.type) {
          case 'NodeCreated': {
            if (graph.nodes.has(event.id)) {
              return error(new Error(`Node with ID ${event.id} already exists`));
            }

            const node: Node = {
              id: event.id,
              ...(event.shapeId !== undefined && { shape: event.shapeId }),
              properties: event.properties,
              metadata: {
                created: event.timestamp,
                modified: event.timestamp,
                modifiedBy: event.deviceId,
                ...(event.hlcTimestamp !== undefined && { hlcTimestamp: event.hlcTimestamp }),
              },
            };

            const newNodes = new Map([...graph.nodes, [node.id, node]]);

            return ok({
              ...graph,
              nodes: newNodes,
              revision: accumulateRevision(graph.revision, event.eventId),
              metadata: advanceMetadata(graph.metadata, event),
            });
          }

          case 'NodePropertiesUpdated': {
            const node = graph.nodes.get(event.id);
            if (!node) {
              return error(new Error(`Node with ID ${event.id} not found`));
            }

            const isEventWins = lwwWins(stampFromEvent(event), stampFromMetadata(node.metadata));
            if (!isEventWins) {
              return ok(graph);
            }

            const updatedProperties = new Map([...node.properties, ...event.changes]);

            const updatedNode: Node = {
              ...node,
              properties: updatedProperties,
              metadata: {
                ...node.metadata,
                modified: event.timestamp,
                modifiedBy: event.deviceId,
                ...(event.hlcTimestamp !== undefined && { hlcTimestamp: event.hlcTimestamp }),
              },
            };

            const newNodes = new Map([...graph.nodes, [node.id, updatedNode]]);

            return ok({
              ...graph,
              nodes: newNodes,
              revision: accumulateRevision(graph.revision, event.eventId),
              metadata: advanceMetadata(graph.metadata, event),
            });
          }

          case 'NodeDeleted': {
            if (!graph.nodes.has(event.id)) {
              return ok(graph);
            }

            const newNodes = new Map([...graph.nodes].filter(([id]) => id !== event.id));

            const newEdges = new Map(
              [...graph.edges].filter(
                ([, edge]) => edge.source !== event.id && edge.target !== event.id,
              ),
            );

            return ok({
              ...graph,
              nodes: newNodes,
              edges: newEdges,
              revision: accumulateRevision(graph.revision, event.eventId),
              metadata: {
                ...graph.metadata,
                modified:
                  event.timestamp > graph.metadata.modified
                    ? event.timestamp
                    : graph.metadata.modified,
                modifiedBy:
                  event.timestamp > graph.metadata.modified
                    ? event.deviceId
                    : graph.metadata.modifiedBy,
              },
            });
          }

          case 'EdgeCreated': {
            if (graph.edges.has(event.id)) {
              return error(new Error(`Edge with ID ${event.id} already exists`));
            }
            if (!graph.nodes.has(event.source)) {
              return error(new Error(`Source node ${event.source} not found`));
            }
            if (!graph.nodes.has(event.target)) {
              return error(new Error(`Target node ${event.target} not found`));
            }

            const edge: Edge = {
              id: event.id,
              ...(event.shapeId !== undefined && { shape: event.shapeId }),
              source: event.source,
              target: event.target,
              properties: event.properties,
              metadata: {
                created: event.timestamp,
                modified: event.timestamp,
                modifiedBy: event.deviceId,
                ...(event.hlcTimestamp !== undefined && { hlcTimestamp: event.hlcTimestamp }),
              },
            };

            const newEdges = new Map([...graph.edges, [edge.id, edge]]);

            return ok({
              ...graph,
              edges: newEdges,
              revision: accumulateRevision(graph.revision, event.eventId),
              metadata: advanceMetadata(graph.metadata, event),
            });
          }

          case 'EdgePropertiesUpdated': {
            const edge = graph.edges.get(event.id);
            if (!edge) {
              return error(new Error(`Edge with ID ${event.id} not found`));
            }

            const isEventWins = lwwWins(stampFromEvent(event), stampFromMetadata(edge.metadata));
            if (!isEventWins) {
              return ok(graph);
            }

            const updatedProperties = new Map([...edge.properties, ...event.changes]);

            const updatedEdge: Edge = {
              ...edge,
              properties: updatedProperties,
              metadata: {
                ...edge.metadata,
                modified: event.timestamp,
                modifiedBy: event.deviceId,
                ...(event.hlcTimestamp !== undefined && { hlcTimestamp: event.hlcTimestamp }),
              },
            };

            const newEdges = new Map([...graph.edges, [edge.id, updatedEdge]]);

            return ok({
              ...graph,
              edges: newEdges,
              revision: accumulateRevision(graph.revision, event.eventId),
              metadata: advanceMetadata(graph.metadata, event),
            });
          }

          case 'EdgeDeleted': {
            if (!graph.edges.has(event.id)) {
              return ok(graph);
            }

            const newEdges = new Map([...graph.edges].filter(([id]) => id !== event.id));

            return ok({
              ...graph,
              edges: newEdges,
              revision: accumulateRevision(graph.revision, event.eventId),
              metadata: {
                ...graph.metadata,
                modified:
                  event.timestamp > graph.metadata.modified
                    ? event.timestamp
                    : graph.metadata.modified,
                modifiedBy:
                  event.timestamp > graph.metadata.modified
                    ? event.deviceId
                    : graph.metadata.modifiedBy,
              },
            });
          }

          case 'WorkflowStarted':
          case 'WorkflowCompleted': {
            return ok(graph);
          }
          default: {
            const unknownEvent = event as Readonly<{ type?: unknown }>;
            return error(new Error(`Unknown event type: ${String(unknownEvent.type)}`));
          }
        }
      },
    ),
  );
  if (!result.ok) {
    return result;
  }
  const nextGraph = result.value;
  const nextIndexes = graph._indexes
    ? incrementalUpdateIndexes(graph._indexes, event, graph, nextGraph)
    : undefined;
  return ok({
    ...nextGraph,
    _indexes: nextIndexes,
  });
}

function applyEventsFold(
  events: readonly GraphEvent[],
  current: Graph,
  index = 0,
): Result<Graph, Error> {
  if (index >= events.length) {
    return ok(current);
  }
  const event = events[index];
  if (event === undefined) {
    return ok(current);
  }
  const result = applyEvent(current, event);
  return result.ok ? applyEventsFold(events, result.value, index + 1) : result;
}

function causalRank(event: GraphEvent): number {
  switch (event.type) {
    case 'NodeCreated': {
      return 0;
    }
    case 'EdgeCreated': {
      return 1;
    }
    case 'NodePropertiesUpdated':
    case 'EdgePropertiesUpdated':
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return 2;
    }
    case 'EdgeDeleted': {
      return 3;
    }
    case 'NodeDeleted': {
      return 4;
    }
  }
}

/**
Orders events causally within each `batchId` group (or singleton when `batchId`
is absent) by `(anchorEventId, causalRank, eventId)`, where `anchorEventId` is
the minimum `eventId` in the batch and `causalRank` orders `NodeCreated` ->
`EdgeCreated` -> updates/workflow -> `EdgeDeleted` -> `NodeDeleted`.
*/
export function sortEventsCausally(events: readonly GraphEvent[]): readonly GraphEvent[] {
  if (events.length <= 1) return events;

  const batchAnchors = new Map(
    events
      .filter((event) => event.batchId !== undefined)
      .toSorted((a, b) => b.eventId.localeCompare(a.eventId))
      .map((event) => [event.batchId as string, event.eventId] as const),
  );

  return [...events].toSorted((a, b) => {
    const anchorA =
      a.batchId === undefined ? a.eventId : (batchAnchors.get(a.batchId) ?? a.eventId);
    const anchorB =
      b.batchId === undefined ? b.eventId : (batchAnchors.get(b.batchId) ?? b.eventId);
    if (anchorA !== anchorB) return anchorA < anchorB ? -1 : 1;

    const rankDiff = causalRank(a) - causalRank(b);
    if (rankDiff !== 0) return rankDiff;

    if (a.eventId === b.eventId) return 0;
    return a.eventId < b.eventId ? -1 : 1;
  });
}

/**
Reconstructs a graph from a stream of events.
Optionally accepts an initial graph state.
*/
export function projectGraph(
  events: readonly GraphEvent[],
  initialGraph: Graph,
): Result<Graph, Error> {
  const sortedEvents = sortEventsCausally(events);
  return applyEventsFold(sortedEvents, initialGraph);
}
