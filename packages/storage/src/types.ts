
export interface GraphStorageMetadata {
  id: string;
  name: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface StorageAdapter {
  /**
   * Initialize the backend (e.g., open DB connection).
   */
  init(): Promise<void>;

  /**
   * Close the backend connection.
   */
  close(): Promise<void>;

  /**
   * Save a graph snapshot.
   * @param graphId The graph ID.
   * @param snapshot The binary snapshot (Yjs update).
   * @param metadata Metadata about the graph.
   */
  save(graphId: string, snapshot: Uint8Array, metadata: GraphStorageMetadata): Promise<void>;

  /**
   * Load a graph snapshot.
   * @param graphId The graph ID.
   * @returns The snapshot if found, null otherwise.
   */
  load(graphId: string): Promise<Uint8Array | null>;

  /**
   * Delete a graph.
   * @param graphId The graph ID.
   */
  delete(graphId: string): Promise<void>;

  /**
   * List all stored graphs.
   */
  list(): Promise<GraphStorageMetadata[]>;
}
