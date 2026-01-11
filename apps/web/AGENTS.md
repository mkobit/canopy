# Application Architecture

## Structure

`apps/web` is the primary user-facing application shell. It integrates core packages into a functional product.

### Key Components

- **StorageContext**: Initializes the `StorageAdapter` (SQLite/IDB) and provides it to the app.
- **GraphContext**: Manages the lifecycle of the active `SyncEngine` and `Graph`. It loads data from storage, initializes the sync engine, and keeps the React state in sync with the Yjs document.
- **Router**: Uses `react-router-dom` with a layout shell (Sidebar + Main).
  - `/`: Home (Graph List)
  - `/graph/:graphId`: Graph Workspace
  - `/graph/:graphId/node/:nodeId`: Node Details/Editor

## State Management Protocol

- **Persistence**: Handled by `@canopy/storage`. Graphs are stored as binary snapshots.
- **Synchronization**: Handled by `@canopy/sync`. The `SyncEngine` manages the live state (Y.Doc) and provides mutation methods (`addNode`, `updateNode`).
- **UI State**: React local state is used for UI transients (form inputs, open menus). Global application state (current graph) is in `GraphContext`.
- **Data Flow**:
  1. UI triggers action (e.g. `saveNode`) via `GraphContext` / `SyncEngine`.
  2. `SyncEngine` updates Y.Doc.
  3. `GraphContext` observes Y.Doc update and refreshes the immutable `Graph` object.
  4. React re-renders with new data.

## Integration

- **UI Components**: Consumes `@canopy/ui` for primitives (NodeView, inputs).
- **Routing**: Maps URLs to graph/node IDs.
- **Search**: Implemented in-memory on the loaded graph for now.

## Verification

- Ensure `pnpm dev` starts the app.
- Ensure all tests pass with `pnpm test`.
