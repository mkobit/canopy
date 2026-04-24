import type { Node, Edge, NodeId, EdgeId, TypeId, GraphEvent, Result } from '@canopy/types';
import { ok } from '@canopy/types';
import type { GraphStore, GraphStoreSnapshot, NodeFilter, EdgeFilter } from './types';

// eslint-disable-next-line max-lines-per-function
export const createInMemoryGraphStore = (): GraphStore => {
  let nodes: Map<NodeId, Node> = new Map();

  let edges: Map<EdgeId, Edge> = new Map();

  let lastEventId: string | undefined = undefined;

  return {
    getNode: (id: NodeId): Node | undefined => {
      return nodes.get(id);
    },

    getNodes: (filter?: NodeFilter): readonly Node[] => {
      let result = [...nodes.values()];

      if (filter?.type) {
        result = result.filter((node) => node.type === filter.type);
      }

      if (filter?.properties) {
        const filterProps = filter.properties;
        result = result.filter((node) => {
          // eslint-disable-next-line functional/no-loop-statements
          for (const [key, value] of filterProps.entries()) {
            if (node.properties.get(key) !== value) {
              return false;
            }
          }
          return true;
        });
      }

      return result;
    },

    getEdge: (id: EdgeId): Edge | undefined => {
      return edges.get(id);
    },

    getEdges: (filter?: EdgeFilter): readonly Edge[] => {
      let result = [...edges.values()];

      if (filter?.type) {
        result = result.filter((edge) => edge.type === filter.type);
      }

      if (filter?.source) {
        result = result.filter((edge) => edge.source === filter.source);
      }

      if (filter?.target) {
        result = result.filter((edge) => edge.target === filter.target);
      }

      return result;
    },

    getEdgesFrom: (nodeId: NodeId, edgeType?: TypeId): readonly Edge[] => {
      const filter: EdgeFilter = edgeType ? { source: nodeId, type: edgeType } : { source: nodeId };
      return [...edges.values()].filter((edge) => {
        let match = edge.source === filter.source;
        if (filter.type) {
          match = match && edge.type === filter.type;
        }
        return match;
      });
    },

    getEdgesTo: (nodeId: NodeId, edgeType?: TypeId): readonly Edge[] => {
      const filter: EdgeFilter = edgeType ? { target: nodeId, type: edgeType } : { target: nodeId };
      return [...edges.values()].filter((edge) => {
        let match = edge.target === filter.target;
        if (filter.type) {
          match = match && edge.type === filter.type;
        }
        return match;
      });
    },

    // eslint-disable-next-line max-lines-per-function
    applyEvents: (events: readonly GraphEvent[]): Result<void, Error> => {
      // eslint-disable-next-line functional/no-loop-statements
      for (const event of events) {
        switch (event.type) {
          case 'NodeCreated': {
            nodes.set(event.id, {
              id: event.id,
              type: event.nodeType,
              properties: new Map(event.properties),
              metadata: {
                created: event.timestamp,
                modified: event.timestamp,
                modifiedBy: event.deviceId,
              },
            });
            break;
          }

          case 'NodePropertiesUpdated': {
            const node = nodes.get(event.id);
            if (node) {
              const newProperties = new Map(node.properties);
              // eslint-disable-next-line functional/no-loop-statements
              for (const [key, value] of event.changes.entries()) {
                newProperties.set(key, value);
              }

              nodes.set(event.id, {
                ...node,
                properties: newProperties,
                metadata: {
                  ...node.metadata,
                  modified: event.timestamp,
                  modifiedBy: event.deviceId,
                },
              });
            }
            break;
          }

          case 'NodeDeleted': {
            nodes.delete(event.id);
            // Remove connected edges
            // eslint-disable-next-line functional/no-loop-statements
            for (const [edgeId, edge] of edges.entries()) {
              if (edge.source === event.id || edge.target === event.id) {
                edges.delete(edgeId);
              }
            }
            break;
          }

          case 'EdgeCreated': {
            edges.set(event.id, {
              id: event.id,
              type: event.edgeType,
              source: event.source,
              target: event.target,
              properties: new Map(event.properties),
              metadata: {
                created: event.timestamp,
                modified: event.timestamp,
                modifiedBy: event.deviceId,
              },
            });
            break;
          }

          case 'EdgePropertiesUpdated': {
            const edge = edges.get(event.id);
            if (edge) {
              const newProperties = new Map(edge.properties);
              // eslint-disable-next-line functional/no-loop-statements
              for (const [key, value] of event.changes.entries()) {
                newProperties.set(key, value);
              }

              edges.set(event.id, {
                ...edge,
                properties: newProperties,
                metadata: {
                  ...edge.metadata,
                  modified: event.timestamp,
                  modifiedBy: event.deviceId,
                },
              });
            }
            break;
          }

          case 'EdgeDeleted': {
            edges.delete(event.id);
            break;
          }

          case 'WorkflowStarted':
          case 'WorkflowCompleted': {
            break;
          } // No state change needed for workflow events here
        }
        lastEventId = event.eventId;
      }

      return ok(undefined);
    },

    getSnapshot: (): GraphStoreSnapshot => {
      return {
        nodes: new Map(nodes),
        edges: new Map(edges),
        lastEventId: lastEventId,
      };
    },

    loadSnapshot: (snapshot: GraphStoreSnapshot): Result<void, Error> => {
      nodes = new Map(snapshot.nodes);
      edges = new Map(snapshot.edges);
      lastEventId = snapshot.lastEventId;
      return ok(undefined);
    },
  };
};
