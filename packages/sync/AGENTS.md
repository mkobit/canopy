# @canopy/sync

The `sync` package manages the lifecycle of Yjs documents, synchronization providers, and presence/awareness.

## Architectural Invariants

- **GraphStore** maps Canopy's domain objects to Yjs data types (`Y.Map`), handling serialization and deserialization.
- **SyncEngine** serves as the main entry point, owning `Y.Doc` and `Awareness` instances.
- **SyncProvider** interface abstracts synchronization backends (WebSocket, WebRTC, etc.).
