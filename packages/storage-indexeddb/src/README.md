# IndexedDB storage adapter

## Overview

This directory provides IndexedDB-backed implementations for the event log (`EventLogStore`) and a graph metadata registry (`GraphRegistry`). All operations return `Result` values and require `init()` before reading or writing.

## Interface

- `[index.ts:*]` Re-exports `createIndexedDBEventLog`, `IndexedDBEventLog`, `createGraphRegistry`, `GraphRegistry`, and `GraphRegistryEntry`.
- `[graph-registry.ts:GraphRegistryEntry]` Exported interface with `readonly` `id`, `name`, `createdAt`, and `updatedAt` string fields.
- `[graph-registry.ts:GraphRegistry]` and `[graph-registry.ts:createGraphRegistry]` `(databaseName = 'canopy-registry') => GraphRegistry` with `init`, `close`, `list`, `upsert`, and `delete`.
- `[indexeddb-event-log.ts:IndexedDBEventLog]` and `[indexeddb-event-log.ts:createIndexedDBEventLog]` `(databaseName = 'canopy-events') => IndexedDBEventLog` extending `EventLogStore` with `init` and `close`.

## Invariants

- `[graph-registry.ts:createGraphRegistry]` and `[indexeddb-event-log.ts:createIndexedDBEventLog]` Return `err(new Error('Database not initialized'))` when `database` is `null`; `init()` is idempotent when already initialized; all async operations wrap IndexedDB calls with `fromAsyncThrowable`.
- `[graph-registry.ts:createGraphRegistry]` Creates `'graphs'` object store (`keyPath: 'id'`) at DB version 1; `[indexeddb-event-log.ts:createIndexedDBEventLog]` creates `'events'` object store (`keyPath: ['graphId', 'eventId']`) at DB version 1.
- `[indexeddb-event-log.ts:MAX_EVENT_ID]` Uses `String.fromCodePoint(0xff_ff)` as upper bound for `IDBKeyRange.bound` (short-circuiting inverted or empty bounds to `ok([])`); `[indexeddb-event-log.ts:decodeIndexedDBRecords]` and `[indexeddb-event-log.ts:decodeChunk]` reverse when `options.reverse` is set, decode via `decodeStoredEvent` (returning the first error and filtering out `null` retired meta-shape events), and decode in chunks when `limit >= 0` so `limit` is satisfied after `null` filtering.

## Side Effects

- Opens, upgrades, reads, writes, deletes, and closes IndexedDB databases (`'canopy-registry'` and `'canopy-events'` by default), mutating internal closure `database` state.

## Verification

- Run: `bun test`
