# Research: Evaluating `@codemix/graph` as a Canopy Storage Variant

## Overview of `@codemix/graph`

[`@codemix/graph`](https://codemix.com/graph) is an open-source, fully typed, in-memory graph database built for TypeScript. It offers a compelling set of features that align well with modern TypeScript applications, especially those dealing with complex, interconnected data models.

### Key Capabilities

- **Type Safety & Schema Validation:** It enforces a strongly typed schema using standard schema libraries (Zod, Valibot, ArkType). Vertices, edges, and their properties are validated at runtime and provide compile-time type safety throughout queries and traversals.
- **Dual Query APIs:**
  - **Gremlin-style Traversals:** A fluent, type-safe API modeled after Apache TinkerPop for programmatic graph navigation (`g.V().hasLabel('Person').out('knows')`).
  - **Cypher Query Language:** Support for parsing and executing Cypher queries (e.g., `MATCH (a)-[:knows]->(b) RETURN a, b`), which is highly advantageous for complex pattern matching or connecting LLMs that generate Cypher.
- **Pluggable Storage Layer:** While primarily in-memory, it is designed with a pluggable storage interface. It provides an `InMemoryGraphStorage` by default and notably offers a `@codemix/y-graph-storage` adapter for Yjs (CRDT) backed collaborative synchronization.
- **Indexing:** Supports Hash (O(1) equality), B-tree (O(log n) range), and Full-text (BM25 scored via `@codemix/text-search`) indexes, maintained incrementally.
- **No Native Dependencies:** It runs anywhere Node or modern bundlers can, making it highly portable.

## Potential Fit within Canopy

Canopy currently utilizes an event-sourced architecture with an `EventLogStore` and `StorageAdapter` (e.g., SQLite) to manage its graph, resolving conflicts using Last-Write-Wins (LWW) and UUIDv7s.

Instead of replacing Canopy's core event-sourced synchronization engine, `@codemix/graph` represents a strong candidate for an **alternative storage backing system**. This would be particularly useful for a variant of Canopy where users choose to self-host or manage their own data independently of the core Canopy sync service.

### Use Cases for a `@codemix/graph` Variant

1. **Local-First, Self-Managed Environments:** Users who want a standalone, robust graph database without needing the full event-log synchronization infrastructure. They could use Canopy's frontend UI, but back it with `@codemix/graph` wired up to a local SQLite database or IndexedDB.
2. **Enterprise Integration:** Deploying Canopy inside a corporate network where the backend uses a sophisticated, privately managed graph database. `@codemix/graph` could serve as the application-level graph interface, wrapping calls to an enterprise SQL/Postgres or dedicated graph DB.
3. **Advanced Querying Needs:** Exposing Cypher query capabilities directly to power users or internal LLM integrations within Canopy, leveraging `@codemix/graph`'s built-in engine.
4. **Alternative Collaboration Models:** Experimenting with CRDT-based collaboration (via the Yjs adapter) as an alternative or complement to event sourcing for specific types of fast-paced, multi-user localized state.

## Architectural Exploration (Scrap Examples)

If we were to integrate `@codemix/graph` as a dependency for a specific Canopy storage variant, it would likely sit behind a class implementing Canopy's `StorageAdapter` or a similar abstraction tailored for graph interactions.

### 1. Translating Canopy Schema to `@codemix/graph` Schema

Canopy's dynamic, user-defined schema would need to be mapped to `@codemix/graph`'s static Zod schema upon initialization.

```typescript
import { Graph, GraphSchema, InMemoryGraphStorage } from '@codemix/graph';
import { z } from 'zod';
// Hypothetical Canopy imports
import { CanopySchemaProvider, NodeTypeId, EdgeTypeId } from '@canopy/core';

// Hypothetical function to translate Canopy's schema definitions
function buildCodemixSchema(canopySchema: CanopySchemaProvider): GraphSchema {
  const vertices: Record<string, any> = {};
  const edges: Record<string, any> = {};

  // Map Canopy Node Types to Codemix Vertices
  for (const nodeType of canopySchema.getNodeTypes()) {
    vertices[nodeType.id] = {
      properties: {
        // Map Canopy properties to Zod
        id: { type: z.string(), index: { type: 'hash', unique: true } },
        created: { type: z.string() },
        modified: { type: z.string() },
        // ... dynamically add property definitions based on Canopy's schema
        name: { type: z.string().optional() },
      },
    };
  }

  // Map Canopy Edge Types to Codemix Edges
  for (const edgeType of canopySchema.getEdgeTypes()) {
    edges[edgeType.id] = {
      properties: {
        id: { type: z.string(), index: { type: 'hash', unique: true } },
        // ... edge properties
      },
    };
  }

  return { vertices, edges } as const satisfies GraphSchema;
}
```

### 2. A Wrapper Storage Adapter

We could build a `CodemixStorageAdapter` that implements the required methods for Canopy to save views or execute queries, translating Canopy's generic read/write requests into `@codemix/graph` operations.

```typescript
import { Graph } from '@codemix/graph';
// Hypothetical Canopy imports
import { StorageAdapter, Result, NodeId, ViewDefinition, SaveViewOptions } from '@canopy/types';

export class CodemixStorageAdapter implements StorageAdapter {
  constructor(private graph: Graph) {}

  async saveView(view: ViewDefinition, options: SaveViewOptions): Promise<Result<void, Error>> {
    try {
      // 1. Begin a transaction (if the underlying storage supports it)

      // 2. Iterate through nodes in the Canopy View
      for (const node of view.nodes) {
        // Check if it exists
        const existingNodes = this.graph.query(`MATCH (n {id: "${node.id}"}) RETURN n`);

        if (existingNodes.length > 0) {
          // Update properties using Codemix API or Cypher
          const v = existingNodes[0].n;
          for (const [key, value] of Object.entries(node.properties)) {
            v.set(key, value);
          }
        } else {
          // Insert new vertex
          this.graph.addVertex(node.typeId, {
            id: node.id,
            ...node.properties,
          });
        }
      }

      // 3. Similarly process edges, ensuring source/target references are correct
      // ...

      return { ok: true, value: undefined };
    } catch (e) {
      return { ok: false, error: e as Error };
    }
  }

  async getNodes(ids: NodeId[]): Promise<Result<Node[], Error>> {
    // Translate request to Gremlin/Cypher
    const queryIds = ids.map((id) => `"${id}"`).join(',');
    const results = this.graph.query(`MATCH (n) WHERE n.id IN [${queryIds}] RETURN n`);

    // Map codemix vertices back to Canopy Node objects
    const canopyNodes = results.map((r) => mapCodemixVertexToCanopyNode(r.n));
    return { ok: true, value: canopyNodes };
  }
}
```

### 3. Persistent Storage Backend for Codemix

To make this a true "storage engine variant" backed by a database like SQLite or Postgres (rather than just `InMemoryGraphStorage` or Yjs), we would need to implement `@codemix/graph`'s abstract `GraphStorage` interface to persist its internal data structures to the database.

```typescript
import { GraphStorage, VertexData, EdgeData } from '@codemix/graph';
// Hypothetical Database Driver
import { db } from './my-sqlite-db';

export class SQLiteGraphStorage implements GraphStorage {
  // Implement the abstract methods required by @codemix/graph

  async getVertex(id: string): Promise<VertexData | undefined> {
    const row = await db.query('SELECT * FROM vertices WHERE id = ?', [id]);
    return row ? parseVertexData(row) : undefined;
  }

  async setVertex(id: string, data: VertexData): Promise<void> {
    await db.execute('REPLACE INTO vertices (id, label, properties) VALUES (?, ?, ?)', [
      id,
      data.label,
      JSON.stringify(data.properties),
    ]);
  }

  // ... implement getEdge, setEdge, getIndex, setIndex, etc.
}

// Initialization
const customStorage = new SQLiteGraphStorage();
const graph = new Graph({ schema: mySchema, storage: customStorage });
const adapter = new CodemixStorageAdapter(graph);
```

## Conclusion

`@codemix/graph` is a highly capable library that provides standard graph database features (Gremlin, Cypher, indexing, schema validation) entirely within TypeScript.

It is perfectly suited to serve as the core engine for an alternative Canopy storage backend. It would allow Canopy to offer a "Bring Your Own Database" or self-managed deployment model where the complex graph relationships and Cypher querying capabilities are handled by `@codemix/graph`, while the actual persistence is backed by a traditional relational database (SQLite/Postgres) via a custom `GraphStorage` implementation.
