# GraphQL adapter

## Overview

This directory defines the GraphQL SDL schema, custom scalars (`JSON`, `PropertyMap`), Relay-style cursor pagination helpers, and `createGraphQLAdapter` wiring `GraphAccessContext` and `EventBus` resolvers to `graphql` execution and subscription.

## Interface

- `[connection.ts:PageInfo]`, `[connection.ts:ConnectionEdge]`, `[connection.ts:Connection]`, `[connection.ts:encodeCursor]`, `[connection.ts:decodeCursor]`, `[connection.ts:buildConnection]` Relay-style cursor pagination types and helpers.
- `[graphql-adapter.ts:GraphQLAdapterOptions]`, `[graphql-adapter.ts:GraphQLRequest]`, `[graphql-adapter.ts:GraphQLAdapterSchema]`, `[graphql-adapter.ts:GraphQLAdapterExecution]`, `[graphql-adapter.ts:GraphQLAdapter]`, `[graphql-adapter.ts:createGraphQLAdapter]` Adapter factory exposing `schema`, `execute`, and `subscribe`.
- `[scalars.ts:GraphQLJSON]`, `[scalars.ts:GraphQLPropertyMap]` Custom `GraphQLScalarType` definitions.
- `[schema-sdl.ts:GRAPHQL_SDL_SCHEMA]` GraphQL SDL string defining scalars, enums, inputs, payloads, `Query`, `Mutation`, and `Subscription`.
- `[schema.ts:buildGraphQLSchema]` Constructs `GraphQLSchema` from `GRAPHQL_SDL_SCHEMA`.
- Subdirectory: [resolvers](./resolvers/README.md) — GraphQL query, mutation, and subscription resolvers backed by `@canopy/graph-access`.

## Invariants

- `[connection.ts:encodeCursor]` and `[connection.ts:decodeCursor]` Encode `'cursor:<offset>'` in Base64; `decodeCursor` returns `0` when Base64 decoding fails or input does not match `/^cursor:(\d+)$/`.
- `[connection.ts:buildConnection]` Edge cursors use `offset + index`; `hasNextPage` is `offset + items.length < totalCount` and `hasPreviousPage` is `offset > 0`.
- `[graphql-adapter.ts:createGraphQLAdapter]` Adapts query and mutation resolvers as `rootValue` functions passing `null` as parent, and maps `eventStream` to `subscriptionResolvers.eventStream.subscribe(null, arguments_)`.
- `[scalars.ts:GraphQLJSON]` and `[scalars.ts:GraphQLPropertyMap]` `parseValue` and `parseLiteral` recursively freeze returned objects via `deepFreeze`; `parseLiteral` parses JSON strings or `SUPPORTED_AST_KINDS` (`OBJECT`, `LIST`, `INT`, `FLOAT`, `BOOLEAN`, `NULL`) and returns `null` otherwise.
- `[schema.ts:buildGraphQLSchema]` Constructs `GraphQLSchema` exclusively from `GRAPHQL_SDL_SCHEMA` via `buildSchema`.

## Side Effects

- `[scalars.ts:deepFreeze]` Calls `Object.freeze` recursively on objects passed to `parseValue` and `parseLiteral`.
- `[graphql-adapter.ts:createGraphQLAdapter]` `execute` and `subscribe` run GraphQL operations against `rootValue` resolvers backed by `GraphAccessContext` and optional `EventBus`.

## Verification

- Run: `bun test`
