# Connect API handlers

## Overview

The Connect handler modules in this directory expose factory functions that adapt `@canopy/graph-access` queries, mutations, and event streaming/replay operations into Connect-compatible request/response and async-generator payloads. Errors from `@canopy/graph-access` are mapped to structured error payloads or stream error items rather than thrown.

## Interface

- `[event-streaming.ts:ConnectEventStreamItem]` Exported `readonly` type for streamed Connect event items (`event_id`, `event_type`, `payload_json`, `sequence_number`, `timestamp`).
- `[event-streaming.ts:ConnectEventStreamOptions]` Exported `readonly` options type (`eventBus?`, `bufferCapacity?`, `maxReplayCount?`).
- `[event-streaming.ts:EventStreamRequestPayload]` Exported `readonly` request type (`last_seen_event_id?`, `graph_id?`, `tenant_id?`, `max_replay_count?`).
- `[event-streaming.ts:createConnectEventStreamHandlers]` Exported factory returning `{ subscribeEventStream, replayEventStream }` async-generator handlers.
- `[queries-mutations.ts:ConnectNodeResponse]`, `[queries-mutations.ts:ConnectNodeListResponse]`, `[queries-mutations.ts:ConnectEdgeResponse]`, `[queries-mutations.ts:ConnectEdgeListResponse]`, `[queries-mutations.ts:ConnectTraversalStepResponse]`, `[queries-mutations.ts:ConnectTraversalResponse]`, `[queries-mutations.ts:ConnectMutationResultResponse]` Exported `readonly` response types.
- `[queries-mutations.ts:createConnectQueryHandlers]` Exported factory returning `{ getNodeById, getNodesByType, getNodesByProperty, getInboundEdges, getOutboundEdges, executeTraversalQuery }`.
- `[queries-mutations.ts:createConnectMutationHandlers]` Exported factory returning `{ createNode, updateNodeProperties, deleteNode, createEdge, deleteEdge }`.

## Invariants

- `[event-streaming.ts:ConnectEventStreamItem]` and `[queries-mutations.ts:ConnectNodeResponse]` All exported payload, option, and response types use `Readonly<...>` and `readonly` arrays.
- `[event-streaming.ts:createSubscribeGenerator]` Stream buffer capacity defaults to `options?.bufferCapacity ?? context.limits?.maxStreamBuffer ?? 100`.
- `[event-streaming.ts:createSubscribeGenerator]` Once `closed.current` is `true` (on `'end'`, `'overflow_disconnect'`, or generator `finally`), the subscriber callback returns `false` and stops enqueueing or resolving items; `finally` always invokes `unsubscribe()` and `subscriber.close()`.
- `[event-streaming.ts:formatMessageToConnectItem]` Maps `EventStreamMessage` kinds: `'event'` serializes `Map` properties/changes via `Object.fromEntries` with `sequenceNumber` defaulting to `0`; `'gap'` maps to `GAP_NOTIFIED` (`seq 0`); `'overflow_disconnect'` maps to `OVERFLOW_DISCONNECT` (`seq 0`); fallback maps to `STREAM_END` with `'{}'` payload (`seq 0`).
- `[event-streaming.ts:createReplayGenerator]` Failed `replayResult` (`!replayResult.ok`) yields a single `REPLAY_ERROR` item and terminates rather than throwing.
- `[queries-mutations.ts:parseJsonPropertyValue]` Falls back to returning the raw `valueJson` string as `PropertyValue` if `JSON.parse` throws.
- `[queries-mutations.ts:handleExecuteTraversalQuery]` Only `filter_predicate_type_ids[0]` is passed as `edgeType` when non-empty; BFS step depths start at `0` for `start_node_id` and `stepMaps` is frozen with `Object.freeze`.
- `[queries-mutations.ts:handleCreateNode]` Parsed `properties` objects in `handleCreateNode`, `handleUpdateNodeProperties`, and `handleCreateEdge` are frozen with `Object.freeze` before execution.
- `[queries-mutations.ts:handleGetNodeById]` Failed `Result` values across all query and mutation handlers are mapped via `createConnectErrorPayload(result.error)` to `{ success: false, error_code, error_message }` rather than thrown; success responses in all five mutation handlers set `sequence_number` to `expectedSequence ?? 1`.

## Side Effects

- `[event-streaming.ts:createSubscribeGenerator]` Creates and subscribes to an event stream subscriber via `createEventStreamSubscriber`, mutates internal queue/resolver/closed refs, and calls `unsubscribe()` and `subscriber.close()` in `finally`.
- `[event-streaming.ts:createReplayGenerator]` Calls `executeReplayEventStream(context, ...)` to fetch replayed events.
- `[event-streaming.ts:formatMessageToConnectItem]` Calls `createInstant()` for synthetic stream control/error item timestamps.
- `[queries-mutations.ts:handleCreateNode]`, `[queries-mutations.ts:handleUpdateNodeProperties]`, `[queries-mutations.ts:handleDeleteNode]`, `[queries-mutations.ts:handleCreateEdge]`, `[queries-mutations.ts:handleDeleteEdge]` Invoke `executeCreateNode`, `executeUpdateNodeProperties`, `executeDeleteNode`, `executeCreateEdge`, and `executeDeleteEdge`, and call `createInstant()` for `committed_at` on delete/edge mutations.

## Verification

- Run: `bun test`
