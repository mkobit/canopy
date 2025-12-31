// TODO: Implement storage backend interface
// TODO: Implement SQLite adapter
// TODO: Implement IndexedDB adapter

export interface StorageAdapter {
  init(): Promise<void>;
  close(): Promise<void>;
}
