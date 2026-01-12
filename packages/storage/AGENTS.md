# @canopy/storage

This package handles persistent storage of the graph data.
It provides a backend-agnostic interface and implementations for SQLite and IndexedDB.

## Code Navigation

- `src/index.ts`: Public API exports.
- `src/types.ts`: Storage backend interfaces and data types.
- `src/sqlite-adapter.ts`: SQLite implementation using `sql.js` (compatible with Desktop and Web via WASM).
- `src/indexeddb-adapter.ts`: IndexedDB implementation using `idb` (Web only fallback).

## Architectural Invariants

- Storage adapters must implement the `StorageAdapter` interface.
- Storage operations should be asynchronous and return Promises.
- The storage package should not depend on core graph logic, only on raw data formats (Uint8Array snapshots).
- Metadata is stored alongside snapshots to facilitate listing without loading full documents.
- Persistence is handled by the adapter; SQLite adapter supports pluggable persistence layers (file system or IndexedDB/OPFS).

## Dependencies

- `@canopy/types`: For domain types (though storage works mostly with blobs).
- `@canopy/sync`: For potential future integration with sync providers.
- `sql.js`: For SQLite engine.
- `idb`: For IndexedDB access.

## Backend Interface

The `StorageAdapter` interface requires:

- `init()`: Initialize connection/resources.
- `close()`: Cleanup.
- `save(graphId, snapshot, metadata)`: Persist graph data.
- `load(graphId)`: Retrieve graph snapshot.
- `delete(graphId)`: Remove graph data.
- `list()`: Enumerate stored graphs.

## Adding New Backends

1. Create a new class implementing `StorageAdapter`.
2. Implement all required methods.
3. Ensure the backend handles its own persistence (e.g., file I/O, network).
4. Export the new adapter in `src/index.ts`.
5. Add tests in `src/storage.test.ts` (or a new test file).
