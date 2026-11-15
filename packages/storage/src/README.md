# Storage core & in-memory adapter

## Overview

This directory provides an in-memory implementation of the `EventLogStore` port (`createInMemoryEventStore`) and re-exports `EventLogStore` and `EventLogQueryOptions` from `@canopy/graph`.

## Interface

- `[index.ts:*]` Re-exports `./types` and `createInMemoryEventStore` from `./in-memory-event-store`.
- `[types.ts:EventLogStore, types.ts:EventLogQueryOptions]` Re-exported from `@canopy/graph`.
- `[in-memory-event-store.ts:createInMemoryEventStore]` `() => EventLogStore`.

## Invariants

- `[in-memory-event-store.ts:appendEvents]` Deduplicates incoming events against existing events for the same `graphId` and within the input batch by `eventId`, and stores events per `graphId` sorted ascending by `eventId` via `localeCompare`.
- `[in-memory-event-store.ts:getEvents]` Filters stored events by `eventId > after`, `eventId < before`, reverses if `reverse` is truthy, and slices to `[0, limit)` when `limit !== undefined && limit >= 0`; both `appendEvents` and `getEvents` always resolve with `ok(...)`.

## Side Effects

- `[in-memory-event-store.ts:appendEvents]` Mutates the closure-scoped `graphs` `Map<string, GraphEvent[]>`.

## Verification

- Run: `bun test`
