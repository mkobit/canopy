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
   - Maps matching `Edge` entities to `ApiEdgePayload`.

3. `executePropertyLookup(request: ApiRequest<PropertyLookupPayload>): ApiResponse<PropertyLookupResult>`
   - Looks up `Node` or `Edge` by `entityId`.
   - Returns `NOT_FOUND` error if entity does not exist.
   - If `propertyKey` is provided, filters properties map to only contain `propertyKey`. Returns `NOT_FOUND` error if `propertyKey` is missing on entity.

4. `executeGraphTraversal(request: ApiRequest<TraversalQueryPayload>): ApiResponse<ApiTraversalPayload>`
   - Traverses graph from `startNodeIds` using BFS up to `maxDepth` and `maxCost`.
   - Bounds depth using `Math.min(request.payload.maxDepth ?? limits.maxQueryDepth, limits.maxQueryDepth)`.
   - Bounds cost using `Math.min(request.payload.maxCost ?? limits.maxQueryCost, limits.maxQueryCost)`.
   - If traversal depth exceeds depth limit or visited node count exceeds cost limit, returns `RESOURCE_EXHAUSTED` error.
   - Returns accumulated `ApiTraversalPayload` containing discovered `ApiNodePayload` nodes and traversed `ApiEdgePayload` edges.

## Error handling

- All errors return `ApiAdapterError` wrapped in `Result.err`.
- Missing target entities for direct ID lookups return `NOT_FOUND` category error.
- Limit violations during traversal return `RESOURCE_EXHAUSTED` category error.
- Unexpected errors return `INTERNAL_ERROR` category error.

## Testing plan

1. Unit tests in `packages/api-adapter/tests/query-handlers.test.ts`:
   - Node lookups by ID, type, and filter criteria.
   - Edge relationship lookups and traversals.
   - Property lookups for nodes and edges.
   - Bounded graph traversals asserting `maxQueryDepth` and `maxQueryCost` enforcement and error return.
