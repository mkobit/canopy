
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
  readonly init: () => Promise<void>;

  /**
   * Close the backend connection.
   */
  readonly close: () => Promise<void>;

  /**
   * Save a graph snapshot.
   * @param graphId The graph ID.
   * @param snapshot The binary snapshot (Yjs update).
   * @param metadata Metadata about the graph.
   */
  readonly save: (graphId: string, snapshot: Uint8Array, metadata: GraphStorageMetadata) => Promise<void>;

  /**
   * Load a graph snapshot.
   * @param graphId The graph ID.
   * @returns The snapshot if found, null otherwise.
   */
  readonly load: (graphId: string) => Promise<Uint8Array | null>;

  /**
   * Delete a graph.
   * @param graphId The graph ID.
   */
  readonly delete: (graphId: string) => Promise<void>;

  /**
   * List all stored graphs.
   */
  readonly list: () => Promise<readonly GraphStorageMetadata[]>;
}
