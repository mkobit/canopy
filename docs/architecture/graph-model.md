# Graph Model Architecture

## Overview

The graph engine is built on top of [Yjs](https://github.com/yjs/yjs), a CRDT library, to ensure offline-first capabilities and eventual consistency across distributed clients.

## Data Model

### Primitives

- **Node**: The fundamental unit. Contains `id`, `type`, `properties`, `created`, `modified`.
- **Edge**: Connects two nodes. Contains `id`, `source`, `target`, `type`, `properties`, `created`, `modified`.

### Meta-circular Type System

The type system is stored within the graph itself.

- **NodeType**: A special Node with `type="NodeType"`. Its properties define the schema for other nodes.
- **EdgeType**: A special Node (conceptually) or Edge definition that defines schema for edges.

This allows the schema to evolve over time using the same sync mechanisms as the data.

## Storage Layer

`packages/core` implements `GraphStore`, which wraps a `Y.Doc`.

- Nodes are stored in a `Y.Map<Node>` named `nodes`.
- Edges are stored in a `Y.Map<Edge>` named `edges`.

### Validation

Validation happens at runtime in `GraphStore` methods (`addNode`, `updateNode`, etc.).
It checks:

1. **Zod Schema**: Structural validity (UUIDs, required fields).
2. **Type Definition**: Validates properties against the `NodeType`/`EdgeType` defined in the graph.

## Query Layer

`packages/query` provides a basic `GraphQuery` class for:

- Finding nodes by type/properties.
- Finding edges.
- Traversing the graph (outgoing/incoming edges).

It operates directly on the `GraphStore` data structures.
