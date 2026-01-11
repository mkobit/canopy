# @canopy/core

Core graph engine implementation using Yjs for CRDT-backed storage.

## Installation

```bash
pnpm add @canopy/core
```

## Usage

```typescript
import { GraphStore } from '@canopy/core';
import * as Y from 'yjs';

// Initialize Yjs document
const doc = new Y.Doc();
const store = new GraphStore(doc);

// Define a NodeType (Schema)
store.addNode({
  type: 'NodeType',
  properties: {
    name: 'Person',
    properties: [
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number' },
    ],
  },
});

// Create a Node
const alice = store.addNode({
  type: 'Person',
  properties: {
    name: 'Alice',
    age: 30,
  },
});

console.log(alice);
```

## Features

- **CRDT Storage**: Uses `Y.Map` for nodes and edges, supporting real-time sync.
- **Type Safety**: Enforces schema validation based on `NodeType` and `EdgeType` definitions stored in the graph.
- **Meta-circular Types**: Types are themselves stored as nodes in the graph.
