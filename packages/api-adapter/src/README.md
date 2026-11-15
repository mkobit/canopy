# API adapter source

## Overview

This directory exposes the `@canopy/api-adapter` barrel entry point (`index.ts`) and pure error-mapping helpers (`result-errors.ts`) that convert `GraphAccessError` values into gRPC status objects and GraphQL error extensions, rolling up the Connect, GraphQL, and IPC transport adapters.

## Interface

- `[index.ts:*]` Re-exports `./connect/*`, `./graphql/*`, `./ipc`, and `./result-errors`.
- `[result-errors.ts:GrpcStatusCode]` Re-exported from `./connect/grpc-errors`.
- `[result-errors.ts:toGrpcStatus]` `(error: GraphAccessError) => Readonly<{ code: GrpcStatusCode; message: string; details?: unknown }>`.
- `[result-errors.ts:toGraphQLExtensions]` `(error: GraphAccessError) => Readonly<{ code: string; category: GraphAccessErrorCategory; details?: unknown }>`.
- Subdirectories:
  - [connect](./connect/README.md) — Connect-RPC adapter, proto3 SDL, gRPC error mapping, and handlers.
  - [graphql](./graphql/README.md) — GraphQL adapter, SDL schema, custom scalars, Relay connections, and resolvers.
  - [ipc](./ipc/README.md) — JSON-RPC 2.0 IPC schemas, OpenRPC 1.3.2 spec, Unix socket server, and Effect client.

## Invariants

- `[result-errors.ts:toGrpcStatus]` Exhaustively maps all seven `GraphAccessErrorCategory` values (`VALIDATION_ERROR -> INVALID_ARGUMENT`, `NOT_FOUND -> NOT_FOUND`, `UNAUTHORIZED -> PERMISSION_DENIED`, `FORBIDDEN -> PERMISSION_DENIED`, `RESOURCE_EXHAUSTED -> RESOURCE_EXHAUSTED`, `CONCURRENCY_CONFLICT -> ABORTED`, `INTERNAL_ERROR -> INTERNAL`).
- `[result-errors.ts:toGrpcStatus]` and `[result-errors.ts:toGraphQLExtensions]` Return `Readonly` objects and include the `details` key only when `error.details !== undefined`.

## Side Effects

- None.

## Verification

- Run: `bun test`
