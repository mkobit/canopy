# Design: Core query execution handlers over projected graph

## Context

Task `canopy-1dk.2` implements query execution handlers in `@canopy/api-adapter` delegating to `@canopy/queries` against projected in-memory graph state.
The handlers cover node filtering, edge relationship traversals, property lookups, and depth/cost bounded graph traversals.

## Architecture and interfaces

### 1. Data payloads (`src/api-payloads.ts`)

Define request payload types for each query category:

```typescript
export type NodeQueryPayload = Readonly<{
  id?: NodeId;
  type?: TypeId;
  filter?: Filter;
  sort?: Sort;
  limit?: number;
}>;

export type EdgeQueryPayload = Readonly<{
  id?: EdgeId;
  type?: TypeId;
  source?: NodeId;
  target?: NodeId;
  direction?: 'in' | 'out' | 'both';
  includeTargetSummary?: boolean;
  limit?: number;
}>;

export type PropertyLookupPayload = Readonly<{
  entityId: NodeId | EdgeId;
  propertyKey?: string;
}>;

export type TraversalQueryPayload = Readonly<{
  startNodeIds: readonly NodeId[];
  edgeType?: TypeId;
  direction?: 'in' | 'out' | 'both';
  maxDepth?: number;
  maxCost?: number;
}>;

export type PropertyLookupResult = Readonly<{
  entityId: NodeId | EdgeId;
  properties: Readonly<Record<string, PropertyValue>>;
}>;
```

### 2. Query execution handlers (`src/query-handlers.ts`)

Implement four public handler functions:

1. `executeNodeQuery(request: ApiRequest<NodeQueryPayload>): ApiResponse<readonly ApiNodePayload[]>`
   - Direct lookup by `id`: checks `context.graph.nodes.get(id)`. Returns `NOT_FOUND` error if `id` is specified but node does not exist.
   - Criteria search (`type`, `filter`, `sort`, `limit`): constructs `@canopy/queries` `Query` AST and invokes `executeQuery(context.graph, query)`.
   - Maps returned `Node` entities to `ApiNodePayload`.

2. `executeEdgeQuery(request: ApiRequest<EdgeQueryPayload>): ApiResponse<readonly ApiEdgePayload[]>`
   - Direct lookup by `id`: checks `context.graph.edges.get(id)`. Returns `NOT_FOUND` error if `id` is specified but edge does not exist.
   - Filter edges matching `type`, `source`, and `target`.
   - Support `direction` traversal relative to source/target nodes.
   - Enforce maximum result limit using `payload.limit` or default query cap.
   - Maps matching `Edge` entities to `ApiEdgePayload`.

3. `executePropertyLookup(request: ApiRequest<PropertyLookupPayload>): ApiResponse<PropertyLookupResult>`
   - Looks up `Node` or `Edge` by `entityId`.
   - Returns `NOT_FOUND` error if entity does not exist.
   - Checks property presence using `Object.prototype.hasOwnProperty`.
   - If `propertyKey` is provided, filters properties map to only contain `propertyKey`. Returns `NOT_FOUND` error if `propertyKey` is missing on entity.

4. `executeGraphTraversal(request: ApiRequest<TraversalQueryPayload>): ApiResponse<ApiTraversalPayload>`
   - Traverses graph from `startNodeIds` using BFS up to `maxDepth` and `maxCost`.
   - Maintains `visitedNodes: Set<NodeId>` and `visitedEdges: Set<EdgeId>` to prevent cyclic infinite loops and duplicate traversal payload entries.
   - Bounds depth using `Math.min(request.payload.maxDepth ?? limits.maxQueryDepth, limits.maxQueryDepth)`.
   - Bounds cost using `Math.min(request.payload.maxCost ?? limits.maxQueryCost, limits.maxQueryCost)`.
   - If traversal depth exceeds depth limit or total visited node count exceeds cost limit, returns `RESOURCE_EXHAUSTED` error.
   - Returns accumulated `ApiTraversalPayload` containing discovered `ApiNodePayload` nodes and traversed `ApiEdgePayload` edges.

## Adversarial review and mitigations

### Resource and performance overhead

#### Risk
Unbounded edge queries and BFS queue memory growth can cause memory exhaustion and event loop blocking.

#### Mitigation
- Add `limit?: number` to `EdgeQueryPayload` with a mandatory maximum default limit (e.g. 1000 items).
- Enforce strict visited entity count checks before queueing neighbor nodes in `executeGraphTraversal`.
- Return `RESOURCE_EXHAUSTED` error if total traversed entity count exceeds `maxCost`.

### Failure modes and edge cases

#### Risk
Graph cycles, missing versus undefined property lookups, and empty `startNodeIds` cause infinite loops or ambiguous query results.

#### Mitigation
- Maintain `visitedNodes` and `visitedEdges` sets during BFS graph traversals to ensure cycle safety and response deduplication.
- Check property existence using `Object.prototype.hasOwnProperty` instead of direct property access in `executePropertyLookup`.
- Return `VALIDATION_ERROR` when `startNodeIds` array is empty in `executeGraphTraversal`.

### Security and isolation

#### Risk
Queries executing without tenant scope or authentication checks risk multi-tenant data leakage.

#### Mitigation
- Filter graph entities by `context.authContext.tenantId` when tenant isolation is configured.
- Require valid `authContext` and read scopes in all query execution entry points, returning `UNAUTHORIZED` or `FORBIDDEN` errors on failure.

### API signature stability and immutability

#### Risk
Mutable data structures or inconsistent error types risk API drift across transport adapters.

#### Mitigation
- Enforce `readonly` modifiers on all payload interfaces, function parameters, and return types.
- Standardize canonical mapping of `ApiAdapterError` categories to gRPC status codes, GraphQL extensions, and WIT error types.

## Error handling

- All errors return `ApiAdapterError` wrapped in `Result.err`.
- Missing target entities for direct ID lookups return `NOT_FOUND` category error.
- Limit violations during traversal return `RESOURCE_EXHAUSTED` category error.
- Invalid payloads return `VALIDATION_ERROR` category error.
- Unexpected errors return `INTERNAL_ERROR` category error.

## Testing plan

1. Unit tests in `packages/api-adapter/tests/query-handlers.test.ts`:
   - Node lookups by ID, type, and filter criteria.
   - Edge relationship lookups and traversals.
   - Property lookups for nodes and edges.
   - Bounded graph traversals asserting cycle prevention, `maxQueryDepth`, and `maxQueryCost` enforcement and error return.
