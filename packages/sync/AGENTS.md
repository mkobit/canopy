# @canopy/sync

This package provides the synchronization layer for Canopy using Yjs (CRDTs).

## Purpose

The `sync` package manages the lifecycle of Yjs documents, synchronization providers, and presence/awareness. It abstracts the underlying CRDT implementation details and provides a clean API for the rest of the system to interact with the graph data in a collaborative manner.

## Yjs Integration Approach

- **GraphStore**: The `GraphStore` class (located in `src/store/graph-store.ts`) maps Canopy's domain objects (Nodes, Edges) to Yjs data types (`Y.Map`). It handles the serialization and deserialization of data, ensuring that the Yjs document reflects the valid state of the graph.
- **SyncEngine**: The `SyncEngine` serves as the main entry point. It owns the `Y.Doc` and `Awareness` instances. It coordinates between the `GraphStore` and the active `SyncProvider`.
- **Awareness**: We use `y-protocols/awareness` to track user presence (who is online, cursor positions, etc.). The `SyncEngine` exposes methods to update local state and observe remote states.

## Provider Abstraction

Canopy supports multiple synchronization backends (providers) via the `SyncProvider` interface.

- **SyncProvider Interface**: Defines the contract for any provider (connect, disconnect, events).
- **InMemoryProvider**: A reference implementation included for testing purposes. It simulates a network in memory, allowing multiple `SyncEngine` instances to sync without a real network connection.

## Future Providers

- **WebSocket**: For client-server sync.
- **WebRTC**: For peer-to-peer sync.
- **IndexedDB**: For offline persistence (likely managed via `@canopy/storage` but using Yjs persistence).

## Usage

```typescript
import { SyncEngine, InMemoryProvider } from '@canopy/sync';

const engine = new SyncEngine();
const provider = new InMemoryProvider('room-1', engine.doc, engine.awareness);

engine.setProvider(provider);

// Use engine.store to mutate graph
engine.store.addNode({ ... });
```
