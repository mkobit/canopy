# Query engine

> Status: **draft**
> Scope: query model, ISO GQL, user-friendly interface, execution pipeline, indexing, query planning, stored and ad-hoc queries
> Depends on: [2026-02-06-core-data-model.md](2026-02-06-core-data-model.md)

---

## 0. Engine-direction decision (2026-08-12, `canopy-3jg`)

Decided after evaluating Logseq 2.0's DataScript reuse against the hand-written-GQL-parser plan ([research](../research/2026-08-12-logseq-2.0-comparison.md) axis D).

Canopy's projected graph is already entity-attribute-value shaped — nodes with typed property maps and typed edges — which is the shape a Datalog-style conjunctive query engine is built to evaluate.
The execution engine (section 5) therefore evolves toward a **small conjunctive / relational core over the projected EAV graph**: pattern goals (edge and property patterns) with unification and join ordering that use the existing `ReadModelPort` indexes (section 6) as access paths.
The current linear pipeline IR (section 3) is a degenerate single-variable case of that core and remains a valid compile target, so the visual builder and programmatic API keep working with no regression.

Boundaries of the decision:

- **This is an engine _shape_, not an end-user text language.** Datalog syntax is not exposed to users; the visual builder stays the primary surface.
- **No ClojureScript in the repo.** DataScript is prior art for the shape only; Canopy stays strict functional TypeScript. Do not add DataScript or any ClojureScript dependency.
- **ISO GQL is deferred, not dropped.** A standards-compliant ISO GQL **read** surface remains a committed future goal — Canopy is a graph and should be queryable with the standard — implemented later as a front-end that compiles GQL to the same conjunctive engine, not as a bespoke planner. GQL **writes** stay out of scope; all mutation goes through the event system.
- **Sequencing.** This records direction only; no engine rewrite ships now. The conjunctive-core work and the eventual GQL front-end each become their own OpenSpec change (with adversarial review), de-risked by a time-boxed strict-TS spike, when actually prioritized.
- A hosted/managed query-and-storage service (see [multi-device sync transports](2026-08-12-multi-device-sync-transports.md) §8) would expose this same engine over the API boundary; it does not change the engine choice.

Sections 4 and 10 below are updated to reflect this; the rest of the document predates the decision and describes the target surfaces and pipeline that still stand.

---

## 1. Principles

The query engine is the read-side of the system.
It executes queries against the materialized graph view, not the event log.
Events are write-side; queries are read-side.

The query engine serves multiple consumers:

- **Renderers** query for child nodes, related content, and view resolution.
- **The application** queries for settings, type definitions, and system state.
- **Users** query their knowledge graph through a visual interface.
- **AI and agentic workflows** query the graph programmatically.

All consumers ultimately use the same execution engine.
The interface varies (no-code UX, GQL strings, programmatic API), but execution is unified.

---

## 2. Query interfaces

The system supports multiple interfaces that compile to the same underlying execution.

### No-code visual interface (primary, first implementation)

A user-friendly query builder similar to Notion's filter/sort/group UX.
Non-technical users can construct queries by selecting node types, adding filters, choosing sort orders, and grouping results.

This is the first implementation priority.
Most users will interact with the query system exclusively through this interface.

The visual interface produces a structured query representation that the execution engine can process.

### ISO GQL (power user, programmatic)

Full ISO GQL support for power users and programmatic access.
GQL was published in April 2024 as the first international standard for graph query languages.

GQL queries are strings that the system parses and executes.
This interface is exposed later, after the visual interface is stable.

The system supports arbitrary GQL reads.
Write operations through GQL are not in scope; writes go through the event system.

### Graph browser

A neo4j-browser-style interface for exploring and perusing graph content.
Useful for developers, power users, and debugging.
This is a UI concern built on top of the query engine, not a separate query interface.

### Programmatic API

A structured API for internal system use and AI/agentic workflows.
Renderers, view resolution, settings lookup, and other internal consumers use this API.

The programmatic API accepts a structured query representation (not strings).
This is the lowest-level interface and the one all others compile down to.

---

## 3. Query model

### Structured query representation

All query interfaces compile to a common structured representation.
This representation is the internal query language of the system.

A query consists of an ordered pipeline of steps:

- **Pattern match**: find nodes and edges matching structural patterns (type, properties, relationships).
- **Filter**: narrow results by property values, edge existence, or computed predicates.
- **Traverse**: follow edges from matched nodes (inbound, outbound, or both).
- **Sort**: order results by property values.
- **Group**: aggregate results by property values or types.
- **Limit/offset**: paginate results.
- **Project**: select which properties to include in results.

### Query results

A query returns a result set of nodes and/or edges, depending on what was projected.
Results carry the full property maps of matched entities.

Result sets are the input to renderers (via view definitions) and to the programmatic API.

### Stored queries

A stored query is a Query node in the graph.
It stores the query definition as properties (the structured representation, and optionally the original GQL string or visual builder state).

Stored queries can have ViewDefinition nodes attached via edges (see view and renderer system doc).
They are reusable, shareable, and can be referenced from markdown content.

### Ad-hoc queries

Not every query needs to be a graph node.
Ad-hoc queries are transient and exist only in application state.

Use cases for ad-hoc queries:

- A user explores data with temporary filters that they don't intend to save.
- Internal system queries (settings lookup, view resolution) that don't need persistence.
- AI agent queries during a workflow that are one-time operations.

Ad-hoc queries use the same execution engine as stored queries.
The only difference is persistence: stored queries are nodes, ad-hoc queries are not.

> **Open question**: whether ad-hoc queries should be optionally promotable to stored queries (a "save this query" action) and what that flow looks like.

---

## 4. ISO GQL

### Why GQL

ISO GQL (ISO/IEC 39075) is the international standard for graph query languages.
It provides a well-defined, vendor-neutral syntax for graph pattern matching and traversal.

Adopting GQL means:

- The query language is not a custom invention; it has a specification.
- Users with graph database experience can apply existing knowledge.
- Future storage engines that natively support GQL can execute queries directly (push-down).
- The standard will evolve and gain tooling support over time.

### Scope of GQL support

The system supports GQL for **read operations only**.
Graph mutations go through the event system, not through GQL write statements.

The initial GQL implementation may support a subset of the full standard.
The subset should cover:

- `MATCH` patterns (node and edge patterns with type and property filters).
- `WHERE` clauses (property comparisons, boolean logic).
- `RETURN` projections (which properties to include).
- `ORDER BY`, `LIMIT`, `OFFSET` for result ordering and pagination.
- Path patterns for multi-hop traversal.

Advanced GQL features (subqueries, graph construction, schema operations) are deferred.

### GQL parser

The system needs a GQL parser that compiles GQL strings into the structured query representation.

> **Resolved (2026-08-12, `canopy-3jg`, see section 0)**: the GQL surface is deferred and, when built, is a thin front-end that compiles GQL to the conjunctive engine — not a bespoke parser-plus-planner.
> Whether that front-end is hand-written, an existing parser library, or a Cypher-first stepping stone is a later sub-decision, made when the surface is actually prioritized.
> The `cypher.ts` stub stays a placeholder until then.

---

## 5. Execution pipeline

### Overview

Query execution follows a pipeline:

```
query interface (visual / GQL / programmatic)
  → structured query representation
  → query planner
  → execution plan
  → storage engine execution
  → result set
```

### Query planner

The query planner translates a structured query into an execution plan optimized for the storage engine.

Even if the first implementation is a naive scan-and-filter, the architecture assumes:

- The storage engine may be remote (network latency matters).
- The storage engine may be distributed (parallelism is possible).
- The storage engine may support native query push-down (GQL-capable graph databases).

The query planner's responsibilities:

- Determine scan order (which pattern to match first).
- Decide what can be pushed down to the storage engine vs what must be done in-memory.
- Estimate result set sizes for join ordering (future optimization).
- Apply index hints from the storage engine.

### Naive execution (first implementation)

The first implementation executes queries in-memory against the projected graph.
Steps are applied sequentially: scan all nodes of a type, filter by properties, traverse edges, sort, limit.

This is correct but not scalable.
It is sufficient for small-to-medium graphs and establishes the execution semantics that optimized implementations must preserve.

As of the `indexed-query-read-model` change (see section 6), `node-scan` by type, `traversal`, and equality `filter` steps consult an in-memory read-model index instead of a full scan.
Any step or predicate the index does not cover falls back to the scan behavior described above, so the naive-execution semantics remain the correctness baseline.

### Storage engine push-down (future)

When the storage engine is a graph database (e.g., Neo4j or similar), the query planner can push the query down to the engine for native execution.
The structured query representation is translated to the engine's native query language.

This is the path to scalability for large graphs and remote storage.

---

## 6. Indexing

Indexing is a **storage engine concern**, not a query engine concern.

The query engine defines what queries are expressible.
The storage engine decides how to make them fast.

### Tier 1: in-memory read-model index (implemented)

The `indexed-query-read-model` change (`openspec/changes/indexed-query-read-model/`) implements the first concrete index behind this contract.
A `ReadModelPort` (`packages/graph/src/read-model.ts`) exposes typed-node lookup, adjacency lookup, and property-equality lookup.
The in-memory implementation (`packages/graph/src/indexes.ts`) extends the existing `GraphIndexes` structure and is maintained in O(delta) per event inside the incremental projection fold, so it stays a pure derivation of the projected graph with no second convergence proof.
The executor (`packages/queries/src/engine.ts`) consults this port for `node-scan` by type, `traversal`, and equality `filter` steps, falling back to a full scan for anything the port doesn't cover (non-equality operators, unindexed value shapes).
`executeQuery`'s signature and result shape are unchanged.

This is Tier 1 only: `@canopy/graph` stays the dependency-free leaf that owns the port, and `apps/web` stays on `@canopy/storage-indexeddb` with no storage-engine change.
A Tier 2 SQL/OPFS-backed read model behind the same port (living in `@canopy/storage-sqlite`) is designed for but deferred; see the change's `design.md` Decisions 5 and 6.

### Index contract

The storage engine may expose an index hint interface that tells the query planner:

- Which node types are indexed.
- Which properties have indexes.
- Which traversal patterns are optimized.

The query planner uses these hints to choose execution strategies.
The query engine does not create, manage, or expose indexes directly: the Tier 1 read-model index above is created and maintained entirely within `@canopy/graph`, and the executor only consults it through the `ReadModelPort` contract.

### Common index patterns

Storage engines should optimize for the most common query patterns:

- **Type scan**: find all nodes of a given type (used by renderers, view resolution, type-based queries).
- **Property lookup**: find nodes where a property equals a value (used by settings lookup, filters).
- **Edge traversal**: find all edges of a given type from/to a node (used by child traversal, reference resolution).
- **Temporal ordering**: find nodes ordered by created/modified time (used by "recent" queries).

These are recommendations, not requirements.
A minimal storage engine (in-memory) may use brute-force scans.
An optimized storage engine (graph database) should index these patterns.

### Exposing indexes to users

Index configuration is not exposed to users initially.
It is an internal concern of the storage engine.

If users need to create custom indexes (for performance tuning on large graphs), that can be added later as an advanced feature.

---

## 7. External and AI access

The API layer is the boundary between the system and everything outside it.
Human users, AI agents, external tools, and third-party integrations all access the system through the same well-defined API.

### Service-oriented boundary

The data model and internal implementation are hidden behind the API layer.
No external consumer has direct access to the graph, the event log, or storage internals.

This means:

- External tools (AI, integrations, browser extensions) can be developed and changed without modifying the application.
- The internal implementation can evolve (swap storage engines, change projection strategy) without breaking external consumers.
- All access control is enforced at the API boundary, not scattered through internals.

### AI agents as full participants

AI agents can do anything a human user or the application itself can do, subject to permissions.
They are not a restricted or second-class consumer.

An AI agent with appropriate authorization can:

- Query the graph (read nodes, traverse edges, execute stored queries).
- Mutate the graph (create nodes, create edges, update properties) through the event system.
- Execute workflows, trigger automations, and interact with views.

The only difference between a human user and an AI agent is the authentication credential and the permissions attached to it.

### Authentication and authorization

External consumers authenticate via standard mechanisms (e.g., OAuth tokens).
Authorization is policy-based, defining what a given credential can access and modify.

The policy model should support fine-grained access control:

- Which namespaces a consumer can read or write.
- Which node types and edge types a consumer can create or modify.
- Which queries a consumer can execute.
- Rate limiting and resource quotas.

> **Open question**: exact policy framework (OPA-style, custom rules, graph-stored policies) is TBD.
> The principle is established: permissions are declarative, external to the consuming tool, and enforced at the API boundary.

### Design implications

Any AI provider (Claude, Gemini, Codex, future models) can integrate with the system by implementing against the API.
No application changes are needed to support a new AI provider.

The API layer provides:

- **Structured query API**: construct and execute queries programmatically.
- **Event submission API**: submit events for graph mutation (with authorization).
- **Serializable results**: query results in machine-readable format, not just rendered HTML.
- **Batch operations**: multiple queries or mutations in a single request.

---

## 8. Internal system queries

The application itself is a heavy consumer of the query engine.

### Common internal query patterns

| Consumer                   | Query pattern                                              | Frequency        |
| -------------------------- | ---------------------------------------------------------- | ---------------- |
| Renderer (child traversal) | Find all `child_of` edges from a node, ordered by position | Very high        |
| View resolution            | Find ViewDefinitions matching a node type                  | High             |
| Settings lookup            | Find settings nodes for a given scope and key              | High             |
| Type validation            | Find NodeType/EdgeType definition for a given TypeId       | High             |
| Bootstrap check            | Check if metatype nodes exist                              | Once per startup |
| Reference resolution       | Find all edges of a given type from/to a node              | Medium           |

These queries must be fast.
They are executed frequently and are on the critical path for rendering and interaction.

The programmatic API should have convenience methods for these common patterns, even though they compile to the same execution engine.

---

## 9. What this document does not cover

| Concern                              | Where it belongs                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| How query results are rendered       | [View and renderer system](2026-02-08-view-and-renderer-system.md)           |
| How queries are stored as nodes      | [Content model](2026-02-06-content-model.md) (query nodes)                   |
| Storage engine implementation        | [Storage layer](2026-02-08-storage-layer.md)                                 |
| Index implementation details         | [Storage layer](2026-02-08-storage-layer.md)                                 |
| Natural language query interface     | AI/agent interaction design                                                  |
| Query permissions and access control | [Extension and execution model](2026-02-08-extension-and-execution-model.md) |

---

## 10. Open questions

1. ~~GQL parser implementation: from scratch, existing library, or Cypher-first migration path.~~ Resolved 2026-08-12 (`canopy-3jg`, section 0): engine goes conjunctive/Datalog-shaped over the EAV projection; ISO GQL is a deferred read-only front-end compiling to it; no ClojureScript. Parser-vs-library is a later sub-decision.
2. Exact GQL subset for initial implementation.
3. Whether ad-hoc queries can be promoted to stored query nodes and what that UX looks like.
4. Whether the no-code visual query builder state is stored as properties on query nodes (enabling round-trip editing).
5. Query caching strategy: whether frequently-executed queries cache their result sets and how cache invalidation works with the event log.
6. How the query planner interface communicates with storage engine index hints.
7. Subscription/live queries: whether a query can "watch" for changes and re-execute when relevant events occur.
8. Policy framework for API authorization: OPA-style, custom rules, graph-stored policies, or hybrid.
9. API protocol: REST, GraphQL, gRPC, or a combination for different use cases.
