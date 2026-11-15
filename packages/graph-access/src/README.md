# Graph access layer

## Overview

This directory implements the typed request/response contracts, error mapping, query/traversal handlers, session-backed mutation handlers, and live/replay event stream handlers for accessing Canopy graphs. It enforces tenant isolation, query depth/cost/limit bounds, and `Result`-based error handling across all operations.

## Interface

- `[index.ts:*]` Re-exports all symbols from `event-stream-handlers`, `graph-access-context`, `graph-access-payloads`, `mutation-handlers`, `query-handlers`, and `result-errors`.
- `[graph-access-context.ts:GraphAccessAuthContext]`, `[graph-access-context.ts:GraphAccessLimits]`, `[graph-access-context.ts:defaultGraphAccessLimits]`, `[graph-access-context.ts:GraphAccessContext]`, `[graph-access-context.ts:createGraphAccessContext]` Auth context, limits, and context factory.
- `[graph-access-payloads.ts:*]` Readonly request/response payload types, stream message types, and `createGraphAccessRequest` / `createGraphAccessErrorResponse` / `createGraphAccessSuccessResponse`.
- `[result-errors.ts:GraphAccessErrorCategory]`, `[result-errors.ts:GraphAccessError]`, `[result-errors.ts:createGraphAccessError]`, `[result-errors.ts:inferCategoryFromError]`, `[result-errors.ts:toGraphAccessError]`, `[result-errors.ts:mapKernelResultToGraphAccessResult]` Normalized 7-category error types and mappers.
- `[event-stream-handlers.ts:EventStreamListener]`, `[event-stream-handlers.ts:EventStreamSubscription]`, `[event-stream-handlers.ts:createEventStreamSubscriber]`, `[event-stream-handlers.ts:executeReplayEventStream]` Live buffered subscription and event-log replay handlers.
- `[mutation-handlers.ts:executeCreateNode]`, `[mutation-handlers.ts:executeUpdateNodeProperties]`, `[mutation-handlers.ts:executeDeleteNode]`, `[mutation-handlers.ts:executeCreateEdge]`, `[mutation-handlers.ts:executeDeleteEdge]`, `[mutation-handlers.ts:executeMutation]` Session-backed mutation handlers.
- `[query-handlers.ts:executeNodeQuery]`, `[query-handlers.ts:executeEdgeQuery]`, `[query-handlers.ts:executePropertyLookup]`, `[query-handlers.ts:executeGraphTraversal]`, `[query-handlers.ts:executeQuery]` Bounded query and BFS traversal handlers.

## Invariants

- `[graph-access-context.ts:defaultGraphAccessLimits]` Defaults to `maxQueryDepth=10`, `maxQueryCost=1000`, `maxStreamBuffer=1000`.
- `[event-stream-handlers.ts:createEventStreamSubscriber]` Defaults `bufferCapacity` to `100`, emits `'overflow_disconnect'` and closes on overflow, and emits `'end'` once on `close()`.
- `[event-stream-handlers.ts:executeReplayEventStream]` Enforces `authContext.tenantId`, requires `eventLogStore` (`'VALIDATION_ERROR'`), defaults `maxReplayCount` to `1000`, and emits `'gap'` when unacknowledged events exceed `maxReplay`.
- `[mutation-handlers.ts:*]` Require `context.session` (`'VALIDATION_ERROR'`), enforce `authContext.tenantId` isolation, reject duplicate IDs (`'CONCURRENCY_CONFLICT'`), and cascade `EdgeDeleted` events on `executeDeleteNode`.
- `[query-handlers.ts:*]` Enforce `authContext.tenantId` on reads, cap `executeEdgeQuery` at `1000` edges, and clamp `executeGraphTraversal` to `maxQueryDepth` / `maxQueryCost` (`'RESOURCE_EXHAUSTED'` on cost overflow).

## Side Effects

- `[graph-access-payloads.ts:createGraphAccessRequest]` Reads `Temporal.Now.instant().epochMilliseconds` when `timestamp` is omitted.
- `[event-stream-handlers.ts:createEventStreamSubscriber]` Subscribes to `context.session.subscribe`, mutates internal closure state, and invokes listener callbacks; `executeReplayEventStream` reads `context.eventLogStore.getEvents`.
- `[mutation-handlers.ts:*]` Call `session.commit(...)` and generate IDs/timestamps via `createNodeId`, `createEdgeId`, `createEventId`, and `createInstant`.

## Verification

- Run: `bun test`
