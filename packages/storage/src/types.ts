import type {
  Result,
  GraphEvent,
  EventId,
  Node,
  Edge,
  NodeId,
  EdgeId,
  TypeId,
} from '@canopy/types';

export interface NodeFilter {
  readonly type?: TypeId;
  readonly properties?: ReadonlyMap<string, unknown>;
}

export interface EdgeFilter {
  readonly type?: TypeId;
  readonly source?: NodeId;
  readonly target?: NodeId;
}

export interface GraphStore {
  readonly getNode: (id: NodeId) => Node | undefined;
  readonly getNodes: (filter?: NodeFilter) => readonly Node[];
  readonly getEdge: (id: EdgeId) => Edge | undefined;
  readonly getEdges: (filter?: EdgeFilter) => readonly Edge[];
  readonly getEdgesFrom: (nodeId: NodeId, edgeType?: TypeId) => readonly Edge[];
  readonly getEdgesTo: (nodeId: NodeId, edgeType?: TypeId) => readonly Edge[];
  readonly applyEvents: (events: readonly GraphEvent[]) => Result<void, Error>;
  readonly getSnapshot: () => GraphStoreSnapshot;
  readonly loadSnapshot: (snapshot: GraphStoreSnapshot) => Result<void, Error>;
}

export interface GraphStoreSnapshot {
  readonly nodes: ReadonlyMap<NodeId, Node>;
  readonly edges: ReadonlyMap<EdgeId, Edge>;
  readonly lastEventId: string | undefined;
}

export interface GraphStorageMetadata {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string; // ISO string
  readonly updatedAt: string; // ISO string
}

export interface StorageAdapter {
  /**
   * Initialize the backend (e.g., open DB connection).
   */
  readonly init: () => Promise<Result<void, Error>>;

  /**
   * Close the backend connection.
   */
  readonly close: () => Promise<Result<void, Error>>;

  /**
   * Save a graph snapshot.
   * @param graphId The graph ID.
   * @param snapshot The binary snapshot (Yjs update).
   * @param metadata Metadata about the graph.
   */
  readonly save: (
    graphId: string,
    snapshot: Uint8Array,
    metadata: GraphStorageMetadata,
  ) => Promise<Result<void, Error>>;

  /**
   * Load a graph snapshot.
   * @param graphId The graph ID.
   * @returns The snapshot if found, null otherwise.
   */
  readonly load: (graphId: string) => Promise<Result<Uint8Array | null, Error>>;

  /**
   * Delete a graph.
   * @param graphId The graph ID.
   */
  readonly delete: (graphId: string) => Promise<Result<void, Error>>;

  /**
   * List all stored graphs.
   */
  readonly list: () => Promise<Result<readonly GraphStorageMetadata[], Error>>;
}

export interface EventLogQueryOptions {
  readonly after?: EventId;
  readonly before?: EventId;
  readonly limit?: number;
  readonly reverse?: boolean;
}

export interface EventLogStore {
  readonly appendEvents: (
    graphId: string,
    events: readonly GraphEvent[],
  ) => Promise<Result<void, Error>>;
  readonly getEvents: (
    graphId: string,
    options?: EventLogQueryOptions,
  ) => Promise<Result<readonly GraphEvent[], Error>>;
}
