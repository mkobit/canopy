# Connect-RPC adapter

## Overview

This directory defines the Connect-RPC service schema, proto3 SDL, gRPC error mapping, and adapter factory wiring query, mutation, and event-stream handlers to `GraphAccessContext`. `createConnectAdapter` exposes the SDL, service descriptors, and service handlers without performing direct I/O.

## Interface

- `[connect-adapter.ts:ConnectAdapterOptions]`, `[connect-adapter.ts:ConnectAdapterServices]`, `[connect-adapter.ts:ConnectAdapter]`, `[connect-adapter.ts:createConnectAdapter]` Factory and types wiring `nodeService`, `edgeService`, `propertyService`, `mutationService`, and `eventStreamService`.
- `[grpc-errors.ts:GrpcStatusCode]`, `[grpc-errors.ts:ApiAdapterErrorPayload]`, `[grpc-errors.ts:ConnectRpcError]`, `[grpc-errors.ts:mapResultErrorToGrpcStatusCode]`, `[grpc-errors.ts:createConnectErrorPayload]` gRPC status code enum and error mappers.
- `[proto-sdl.ts:PROTO_SERVICES_SDL]` Proto3 SDL string for package `canopy.api.v1`.
- `[schema.ts:ConnectServiceMethod]`, `[schema.ts:ConnectServiceDescriptor]`, `[schema.ts:PROTO_SERVICES_SDL]`, `[schema.ts:CONNECT_SERVICE_DESCRIPTORS]` Service descriptors for `NodeService`, `EdgeService`, `PropertyService`, `GraphMutationService`, and `EventStreamService`.
- Subdirectory: [handlers](./handlers/README.md) — Connect query, mutation, and async-generator event-stream handlers.

## Invariants

- `[connect-adapter.ts:ConnectAdapterOptions]` All exported adapter option, service, and adapter types are `Readonly`.
- `[connect-adapter.ts:createConnectAdapter]` `nodeService`, `edgeService`, and `propertyService` share a single `createConnectQueryHandlers(context)` instance.
- `[grpc-errors.ts:mapResultErrorToGrpcStatusCode]` Resolves `error.code ?? error.category` first, falls back to `error.category`, and defaults to `GrpcStatusCode.INTERNAL` (`13`).
- `[grpc-errors.ts:createConnectErrorPayload]` Defaults `errorCode` to `error.code ?? error.category ?? 'UNKNOWN'` and omits `details` when `error.details === undefined`.
- `[proto-sdl.ts:PROTO_SERVICES_SDL]` and `[schema.ts:CONNECT_SERVICE_DESCRIPTORS]` Mark `isStreaming: true` / server-streaming only for `EventStreamService` methods (`subscribeEventStream`, `replayEventStream`).

## Side Effects

- `[connect-adapter.ts:createConnectAdapter]` Invokes `createConnectQueryHandlers(context)`, `createConnectMutationHandlers(context)`, and `createConnectEventStreamHandlers(context, options)`.

## Verification

- Run: `bun test`
