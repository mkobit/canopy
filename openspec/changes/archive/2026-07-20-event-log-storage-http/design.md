# Design: HTTP client storage backend

## Context

Bead `canopy-1q5.2`.
This document details the design for `@canopy/storage-http`, which implements the `EventLogStore` port over HTTP.
The storage backend acts as a dumb event carrier to append and retrieve events from a remote server.

## Goals & non-goals

### Goals

- Implement the `EventLogStore` interface from `@canopy/graph`.
- Support configuration of base URL, headers, and custom fetch function.
- Serialize `Map` properties within events before sending them over the wire.
- Deserialize `Map` properties back when events are retrieved.
- Support query options (`after`, `before`, `limit`, `reverse`) by converting them to query parameters.
- Provide comprehensive test coverage using a mock server.

### Non-goals

- Implement the server-side persistence or API in this package.
- Implement conflict resolution or graph projection within the storage package.

## Decisions

### Decision 1: Use standard fetch API with override

We choose to use the standard global `fetch` API for network requests.
To allow flexibility in testing and node environments, we support a custom `fetch` function override in the configuration options.
This enables clean unit testing using mock fetch utilities without spawning a real network server.

### Decision 2: Endpoint routing format

We choose the following endpoints:

- `POST /graphs/:graphId/events` to append events.
- `GET /graphs/:graphId/events` to query events.
  This keeps the path simple and REST-compliant.

### Decision 3: Standard JSON serialization and deserialization

We choose to convert `Map` instances in event payload properties (`properties` and `changes`) to standard JavaScript objects on serialization, and restore them to `Map` instances on deserialization.
This matches the sqlite and file implementations in the workspace.

## Technical implementation details

### Package signature

The package exports `createHTTPEventLog` and options types.

```typescript
export interface HTTPOptions {
  readonly headers?: Record<string, string>;
  readonly fetch?: typeof fetch;
}

export interface HTTPEventLog extends EventLogStore {}

export const createHTTPEventLog = (
  baseUrl: string,
  options?: HTTPOptions,
): HTTPEventLog;
```

### Append events

For `appendEvents(graphId, events)`, the client sends a `POST` request to `${baseUrl}/graphs/${graphId}/events`.
The body is a JSON object containing the serialized events:

```json
{
  "events": [...]
}
```

If the server returns a non-2xx status, the function returns a `Result` error wrapping the failure message.

### Get events

For `getEvents(graphId, options)`, the client sends a `GET` request to `${baseUrl}/graphs/${graphId}/events` with query parameters corresponding to `EventLogQueryOptions`.
The server response is expected to be:

```json
{
  "events": [...]
}
```

The client deserializes the events and returns them as a `Result` containing the array.
