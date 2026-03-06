import type { Node, Edge, NodeId, EdgeId, TypeId, GraphEvent, Result } from '@canopy/types';
import { ok, asDeviceId } from '@canopy/types';
import type { GraphStore, GraphStoreSnapshot, NodeFilter, EdgeFilter } from './types';

// eslint-disable-next-line functional/no-classes
export class InMemoryGraphStore implements GraphStore {
  // eslint-disable-next-line functional/prefer-immutable-types
  private nodes: Map<NodeId, Node> = new Map();
  // eslint-disable-next-line functional/prefer-immutable-types
  private edges: Map<EdgeId, Edge> = new Map();
  // eslint-disable-next-line functional/prefer-immutable-types
  private lastEventId: string | undefined = undefined;

  public getNode(id: NodeId): Node | undefined {
    return this.nodes.get(id);
  }

  public getNodes(filter?: NodeFilter): readonly Node[] {
    // eslint-disable-next-line functional/no-let
    let result = [...this.nodes.values()];

    if (filter?.type) {
      result = result.filter((node) => node.type === filter.type);
    }

    if (filter?.properties) {
      const filterProps = filter.properties;
      result = result.filter((node) => {
        for (const [key, value] of filterProps.entries()) {
          if (node.properties.get(key) !== value) {
            return false;
          }
        }
        return true;
      });
    }

    return result;
  }

  public getEdge(id: EdgeId): Edge | undefined {
    return this.edges.get(id);
  }

  public getEdges(filter?: EdgeFilter): readonly Edge[] {
    // eslint-disable-next-line functional/no-let
    let result = [...this.edges.values()];

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
  }

  public getEdgesFrom(nodeId: NodeId, edgeType?: TypeId): readonly Edge[] {
    const filter: EdgeFilter = edgeType ? { source: nodeId, type: edgeType } : { source: nodeId };
    return this.getEdges(filter);
  }

  public getEdgesTo(nodeId: NodeId, edgeType?: TypeId): readonly Edge[] {
    const filter: EdgeFilter = edgeType ? { target: nodeId, type: edgeType } : { target: nodeId };
    return this.getEdges(filter);
  }

  public applyEvents(events: readonly GraphEvent[]): Result<void, Error> {
    for (const event of events) {
      switch (event.type) {
        case 'NodeCreated': {
          this.nodes.set(event.id, {
            id: event.id,
            type: event.nodeType,
            properties: new Map(event.properties),
            metadata: {
              created: event.timestamp,
              modified: event.timestamp,
              modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
            },
          });
          break;
        }

        case 'NodePropertiesUpdated': {
          const node = this.nodes.get(event.id);
          if (node) {
            const newProperties = new Map(node.properties);
            for (const [key, value] of event.changes.entries()) {
              newProperties.set(key, value);
            }
            this.nodes.set(event.id, {
              ...node,
              properties: newProperties,
              metadata: {
                ...node.metadata,
                modified: event.timestamp,
                modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
              },
            });
          }
          break;
        }

        case 'NodeDeleted': {
          this.nodes.delete(event.id);
          // Remove connected edges
          for (const [edgeId, edge] of this.edges.entries()) {
            if (edge.source === event.id || edge.target === event.id) {
              this.edges.delete(edgeId);
            }
          }
          break;
        }

        case 'EdgeCreated': {
          this.edges.set(event.id, {
            id: event.id,
            type: event.edgeType,
            source: event.source,
            target: event.target,
            properties: new Map(event.properties),
            metadata: {
              created: event.timestamp,
              modified: event.timestamp,
              modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
            },
          });
          break;
        }

        case 'EdgePropertiesUpdated': {
          const edge = this.edges.get(event.id);
          if (edge) {
            const newProperties = new Map(edge.properties);
            for (const [key, value] of event.changes.entries()) {
              newProperties.set(key, value);
            }
            this.edges.set(event.id, {
              ...edge,
              properties: newProperties,
              metadata: {
                ...edge.metadata,
                modified: event.timestamp,
                modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
              },
            });
          }
          break;
        }

        case 'EdgeDeleted': {
          this.edges.delete(event.id);
          break;
        }
      }
      this.lastEventId = event.eventId;
    }

    return ok(undefined);
  }

  public getSnapshot(): GraphStoreSnapshot {
    return {
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
      lastEventId: this.lastEventId,
    };
  }

  public loadSnapshot(snapshot: GraphStoreSnapshot): Result<void, Error> {
    this.nodes = new Map(snapshot.nodes);
    this.edges = new Map(snapshot.edges);
    this.lastEventId = snapshot.lastEventId;
    return ok(undefined);
  }
}
