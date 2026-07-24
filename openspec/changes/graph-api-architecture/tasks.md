## 1. Package setup and adapter foundation

- [x] 1.1 Create `packages/api-adapter` directory with `@canopy/api-adapter` package manifest, workspace configuration, TypeScript configuration, and root entry exports
- [x] 1.2 Wire `@canopy/api-adapter` into workspace root `package.json`, TypeScript project references, and build pipeline
- [x] 1.3 Define core API adapter context, unified request and response payload types, and result error mapping utilities

## 2. Core query execution handlers

- [x] 2.1 Implement node query handlers delegating to `@canopy/queries` to fetch projected nodes by identifier, type, or property criteria
- [x] 2.2 Implement edge relationship query handlers to return inbound and outbound edge traversals with target node summaries from projected memory
- [x] 2.3 Implement property lookup and graph traversal query handlers using `@canopy/queries` over projected in-memory graph state

## 3. Core GraphSession mutation handlers

- [x] 3.1 Implement node creation, property update, and node deletion mutation handlers using `GraphSession` kernel operations
- [x] 3.2 Implement edge creation and edge deletion mutation handlers routing write requests through `GraphSession`
- [x] 3.3 Wire mutation handlers to validate schemas, enforce referential integrity, check optimistic concurrency sequence numbers, and commit atomic events to `EventLogStore`
- [x] 3.4 Implement structured result error handling to reject invalid mutation payloads without modifying graph state or persistent event logs

## 4. Event log streaming interface

- [x] 4.1 Implement real-time event subscription handler to broadcast newly committed operational events to active stream listeners
- [x] 4.2 Implement event catch-up replay handler to fetch and stream unacknowledged events from `EventLogStore` when provided a last-seen event identifier

## 5. GraphQL protocol adapter

- [x] 5.1 Define GraphQL schema definition for graph query, mutation, and event subscription types
- [x] 5.2 Implement GraphQL query resolvers binding node, edge, and traversal operations to core query handlers
- [x] 5.3 Implement GraphQL mutation resolvers delegating write operations to core `GraphSession` mutation handlers
- [x] 5.4 Implement GraphQL subscription resolvers mapping live event streams and catch-up replay to the event log streaming interface

## 6. Connect-Web and gRPC protocol adapter

- [ ] 6.1 Define Protocol Buffer service schemas for node, edge, property, mutation, and streaming endpoints
- [ ] 6.2 Generate Connect-Web service interfaces and implement RPC handlers binding requests to core query and `GraphSession` mutation handlers
- [ ] 6.3 Implement gRPC server streaming handlers for event log subscription and catch-up replay RPCs

## 7. WASM WIT host bindings adapter

- [ ] 7.1 Define WebAssembly Interface Type (WIT) specifications for graph query and mutation host capabilities
- [ ] 7.2 Implement WASM host import bindings delegating plugin calls to `GraphSession` mutations and query handlers
- [ ] 7.3 Implement sandboxed execution boundaries and memory safety checks for WebAssembly guest plugin invocations

## 8. Testing and quality assurance

- [ ] 8.1 Write unit tests for core query handlers, `GraphSession` mutation handlers, validation rejection, and event log streaming replay
- [ ] 8.2 Write integration tests for GraphQL resolvers, Connect-Web/gRPC endpoints, and WASM WIT host bindings
- [ ] 8.3 Write concurrency tests asserting write conflict rejection and state consistency under concurrent mutations
- [ ] 8.4 Run `bun test`, `bun run typecheck`, and `bun run lint` to verify quality gates across all packages
