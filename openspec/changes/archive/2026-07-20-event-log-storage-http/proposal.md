## Why

To support pluggable storage and sync backends beyond the browser's IndexedDB and SQLite databases, the Canopy architecture requires a server-persisted storage adapter.
This backend will serialize graph events and transmit them over HTTP.
This enables a remote server to persist the event log and sync it across different devices.

## What changes

- **New `@canopy/storage-http` package**: Create a new workspace package that implements the `EventLogStore` interface.
- **HTTP client implementation**: Build a client using the standard `fetch` API to send requests to a configurable endpoint.
- **Serialization and deserialization**: Ensure that `Map` properties and changes within `GraphEvent` are correctly mapped to JSON objects when transmitting, and restored when receiving.
- **Integration testing**: Create mock server tests using standard tools to verify the HTTP transport, query options, and error paths.

## Capabilities

### New capabilities

- `storage-http-event-log`: Persist and query graph events over an HTTP connection.

### Modified capabilities

<!-- None -->

## Impact

- `@canopy/storage-http`: New library package containing the HTTP event log store.
