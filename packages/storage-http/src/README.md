# HTTP event log adapter

## Overview

This directory implements an HTTP client adapter (`HTTPEventLog`) for `@canopy/graph`'s `EventLogStore` port over `fetch`, serializing and deserializing `GraphEvent` payloads to and from `/graphs/${graphId}/events`.

## Interface

- `[index.ts:*]` Re-exports `createHTTPEventLog`, `HTTPEventLog`, and `HTTPOptions` from `./http-event-log`.
- `[http-event-log.ts:HTTPOptions]` Exported interface with optional `readonly` `headers` (`Record<string, string>`) and `fetch` (`typeof fetch`).
- `[http-event-log.ts:HTTPEventLog]` Exported type alias for `EventLogStore`.
- `[http-event-log.ts:createHTTPEventLog]` `(baseUrl: string, options?: HTTPOptions) => HTTPEventLog`.

## Invariants

- `[http-event-log.ts:createHTTPEventLog]` Strips a single trailing `'/'` from `baseUrl` and wraps network, non-ok HTTP status, and parsing errors into `Result<T, Error>` via `fromAsyncThrowable`.
- `[http-event-log.ts:serializeEvent]` and `[http-event-log.ts:deserializeEvent]` Convert `Map` fields (`properties`, `changes`) to/from plain objects; `deserializeEvent` delegates to `decodeStoredEvent` (read-side upcasting legacy fields and returning `null` for retired meta-shape events).
- `[http-event-log.ts:createHTTPEventLog]` In `getEvents`, extracts events from `response.events` or top-level array (otherwise `[]`), returns the first `deserializeEvent` error if any element fails, and filters out `null` retired meta-shape events.

## Side Effects

- `[http-event-log.ts:createHTTPEventLog]` `appendEvents` issues HTTP `POST ${cleanBase}/graphs/${graphId}/events`; `getEvents` issues HTTP `GET ${cleanBase}/graphs/${graphId}/events` with optional `after`, `before`, `limit`, and `reverse` query parameters.

## Verification

- Run: `bun test`
