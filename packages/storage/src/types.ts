import type { Result } from '@canopy/types';

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
