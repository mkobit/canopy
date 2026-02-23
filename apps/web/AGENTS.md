# apps/web

## Architectural Invariants

- **StorageContext** initializes the `StorageAdapter` (SQLite/IDB).
- **GraphContext** manages the lifecycle of the active `SyncEngine` and `Graph`.
- **UI State**: React local state is used for transients; global application state (current graph) is in `GraphContext`.

## Verification

- Ensure `bun run dev` starts the app.
- Ensure all tests pass with `bun test`.
