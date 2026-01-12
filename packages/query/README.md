# @canopy/query

This package provides the query execution engine and query builder for Canopy.
It allows structured retrieval of nodes and edges based on type, properties, and relationships.

## Features

- **Query Builder**: Fluent API for constructing queries.
- **Node Queries**: Find nodes by type, property predicates, and connected edges.
- **Edge Queries**: Find edges by type, source/target, and property predicates.
- **Traversal**: Follow edges from a node to find connected nodes.
- **Filtering**: Support for equality, comparison, contains, and exists checks.
- **Sorting & Limiting**: Order results and cap the number of returned items.

## Usage

```typescript
import { query, executeQuery } from '@canopy/query';
import { Graph } from '@canopy/types';

const myGraph: Graph = ...;

// Find all Person nodes where age > 30, sorted by name
const q = query()
  .nodes('Person')
  .where('age', 'gt', 30)
  .orderBy('name')
  .limit(10)
  .build();

const result = executeQuery(myGraph, q);
console.log(result.nodes);

// Find friends of Alice
const q2 = query()
  .nodes('Person')
  .where('name', 'eq', 'Alice')
  .traverse('knows', 'out')
  .build();

const friends = executeQuery(myGraph, q2);
```

## Architecture

The package is split into:

- `model.ts`: Defines the Intermediate Representation (IR) of a query.
- `builder.ts`: Provides the fluent API to construct the IR.
- `engine.ts`: Executes the IR against a Graph instance.

This separation allows future implementation of query parsers (e.g., Cypher) that target the same IR.
