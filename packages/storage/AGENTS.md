# @canopy/storage

## Architectural Invariants

- Storage adapters must implement the `StorageAdapter` interface.
- Storage operations should be asynchronous and return Promises.
- The storage package should not depend on core graph logic, only on raw data formats (Uint8Array snapshots).
- Metadata is stored alongside snapshots to facilitate listing without loading full documents.
- Persistence is handled by the adapter; SQLite adapter supports pluggable persistence layers (file system or IndexedDB/OPFS).
