# Design: GraphQL protocol adapter (`canopy-1dk.5`)

## Context

The Graph API Architecture epic introduces protocol transport adapters over `@canopy/api-adapter`.
The GraphQL protocol adapter provides a schema definition language (SDL) interface, resolver engine, and transport bridge over core query handlers (`@canopy/queries`), `GraphSession` kernel mutation handlers, and real-time event log streaming interfaces.
This document specifies the GraphQL protocol adapter including GQL ISO query layer integration, GraphQL Connection pagination, type system introspection APIs, and actor quadruplet provenance context.

## Goals / non-goals

### Goals

- Implement executable GraphQL SDL schema definitions for node, edge, traversal, type system, and ISO GQL queries.
- Support standard Relay Cursor Connection pagination (`first`, `after`, `last`, `before`, `PageInfo`, `totalCount`, `edges`) across graph collection queries.
- Expose GQL / Cypher ISO query execution (`gqlQuery`) delegating to `@canopy/queries`.
- Map graph type system definitions (`nodeTypes`, `edgeTypes`, `propertyTypes`, `systemIds`) for graph introspection.
- Execute graph mutations (`createNode`, `updateNodeProperties`, `deleteNode`, `createEdge`, `deleteEdge`) through `GraphSession` kernel operations.
- Enforce actor and provenance context (`actorId`, `actorType`, `deviceId`, `tenantId`, `batchId`) across both remote client connections and in-process plugin calls.
- Support real-time event streaming subscriptions (`eventStream`) over `@canopy/api-adapter` subscription interfaces.

### Non-goals

- Implementing custom non-standard GraphQL protocol extensions.
- Replacing `@canopy/queries` query engine or `EventLogStore` persistence.

## Architecture and design decisions

### Decision 1: Use `graphql` library with executable SDL schema and Relay Connection pattern

- **Rationale**: The official `graphql` JS library provides AST parsing, schema validation, and resolver execution.
  Using standard Relay Connection types (`NodeConnection`, `EdgeConnection`, `PageInfo`) ensures standard pagination behavior across GraphQL clients.
- **Alternatives**: Offloading pagination to offset/limit was rejected because cursor connections provide stable pagination over dynamically changing event-sourced graph states.

### Decision 2: Expose GQL ISO query layer (`gqlQuery`) over `@canopy/queries`

- **Rationale**: Canopy uses GQL / Cypher query patterns (`MATCH (n:Type) RETURN n`) in `@canopy/queries`. Exposing a dedicated `gqlQuery` field permits complex pattern matching over the projected graph and returns paginated `NodeConnection` results.
- **Alternatives**: Restricting queries strictly to hardcoded field parameters was rejected because graph consumers require flexible pattern queries.

### Decision 3: Symmetrical actor context and quadruplet event provenance

- **Rationale**: Both in-process plugins (WASM WIT) and remote clients (GraphQL / gRPC) invoke operations against `@canopy/api-adapter`.
  Accepting an `ActorContextInput` (`actorId`, `actorType`: `USER` | `PLUGIN` | `WORKFLOW` | `SYSTEM`, `deviceId`, `batchId`) guarantees that every mutation produces an event tagged with full actor quadruplet provenance `(eventId, deviceId, actorId, batchId)`.
- **Alternatives**: Implicitly attributing all GraphQL mutations to a generic system actor was rejected because auditability and plugin accountability require explicit actor tracking.

## GraphQL Schema Definition (SDL)

```graphql
enum ActorType {
  USER
  PLUGIN
  WORKFLOW
  SYSTEM
}

input ActorContextInput {
  actorId: ID!
  actorType: ActorType!
  deviceId: ID
  tenantId: ID
  batchId: ID
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type PropertyValue {
  key: String!
  stringValue: String
  numberValue: Float
  booleanValue: Boolean
  jsonValue: String
}

type NodePayload {
  id: ID!
  type: ID!
  properties: [PropertyValue!]!
  createdAt: String
  updatedAt: String
  inboundEdges(type: ID, first: Int, after: String): EdgeConnection!
  outboundEdges(type: ID, first: Int, after: String): EdgeConnection!
}

type NodeEdge {
  cursor: String!
  node: NodePayload!
}

type NodeConnection {
  totalCount: Int!
  edges: [NodeEdge!]!
  pageInfo: PageInfo!
}

type EdgePayload {
  id: ID!
  type: ID!
  source: ID!
  target: ID!
  properties: [PropertyValue!]!
  sourceNode: NodePayload
  targetNode: NodePayload
}

type GraphEdgeEdge {
  cursor: String!
  edge: EdgePayload!
}

type EdgeConnection {
  totalCount: Int!
  edges: [GraphEdgeEdge!]!
  pageInfo: PageInfo!
}

type TraversalPayload {
  nodes: [NodePayload!]!
  edges: [EdgePayload!]!
}

type NodeTypeDefinition {
  id: ID!
  name: String!
  description: String
  properties: [String!]!
}

type EdgeTypeDefinition {
  id: ID!
  name: String!
  description: String
  sourceType: String
  targetType: String
}

type SystemIdsSummary {
  nodeTypes: [ID!]!
  edgeTypes: [ID!]!
  namespaces: [ID!]!
}

type GraphEventPayload {
  type: String!
  eventId: ID!
  entityId: ID!
  timestamp: String!
  deviceId: ID!
  actorId: ID
  batchId: String
  payloadJson: String!
}

type StreamMessagePayload {
  kind: String!
  event: GraphEventPayload
  gapCount: Int
  lastSeenEventId: ID
  reason: String
}

type MutationResultPayload {
  id: ID!
  success: Boolean!
  affectedEventsCount: Int!
  sequenceNumber: Int
}

input CreateNodeInput {
  id: ID
  type: ID!
  propertiesJson: String!
  expectedSequence: Int
}

input UpdateNodePropertiesInput {
  id: ID!
  propertiesJson: String!
  expectedSequence: Int
}

input DeleteNodeInput {
  id: ID!
  expectedSequence: Int
}

input CreateEdgeInput {
  id: ID
  type: ID!
  source: ID!
  target: ID!
  propertiesJson: String
  expectedSequence: Int
}

input DeleteEdgeInput {
  id: ID!
  expectedSequence: Int
}

type Query {
  node(id: ID!): NodePayload
  nodes(type: ID, first: Int, after: String): NodeConnection!
  edges(source: ID, target: ID, type: ID, first: Int, after: String): EdgeConnection!
  traversal(startNodeIds: [ID!]!, edgeType: ID, maxDepth: Int): TraversalPayload!
  gqlQuery(query: String!, paramsJson: String, first: Int, after: String): NodeConnection!
  nodeTypes: [NodeTypeDefinition!]!
  nodeType(id: ID!): NodeTypeDefinition
  edgeTypes: [EdgeTypeDefinition!]!
  edgeType(id: ID!): EdgeTypeDefinition
  systemIds: SystemIdsSummary!
}

type Mutation {
  createNode(input: CreateNodeInput!, actor: ActorContextInput): MutationResultPayload!
  updateNodeProperties(input: UpdateNodePropertiesInput!, actor: ActorContextInput): MutationResultPayload!
  deleteNode(input: DeleteNodeInput!, actor: ActorContextInput): MutationResultPayload!
  createEdge(input: CreateEdgeInput!, actor: ActorContextInput): MutationResultPayload!
  deleteEdge(input: DeleteEdgeInput!, actor: ActorContextInput): MutationResultPayload!
}

type Subscription {
  eventStream(lastSeenEventId: ID, bufferCapacity: Int): StreamMessagePayload!
}
```

## Adversarial review and mitigations

### Resource and performance overhead

#### Risk

Deep GraphQL traversals or un-bounded ISO GQL queries can consume excessive CPU or memory, causing event-loop starvation.

#### Mitigation

- Enforce `maxQueryDepth` and `maxQueryCost` checks before query execution in the GraphQL adapter.
- Cap connection page size (`first`) to a maximum of 100 items per request.

### Failure modes and edge cases

#### Risk

Malformed ISO GQL query strings or invalid JSON property payloads could crash resolver execution.

#### Mitigation

- Wrap ISO GQL query execution in defensive try-catch guards, returning structured `GraphError` extensions without throwing unhandled exceptions.
- Validate property JSON strings using Zod schemas in `@canopy/graph` before mutation execution.

### Security and isolation

#### Risk

Untrusted plugins or API clients could impersonate system actors or bypass tenant isolation boundaries.

#### Mitigation

- Validate `ActorContextInput` against `ApiAuthContext` permissions; reject unauthorized actor overrides.

### Migration and backward compatibility

#### Risk

Evolution of GraphQL SDL schemas could break existing client queries.

#### Mitigation

- Derive GraphQL SDL types strictly from canonical `@canopy/api-adapter` types and enforce backward compatibility in schema updates.

## Testing strategy

### Unit testing

- Test SDL schema compilation and schema validation.
- Test query resolvers for `node`, `nodes`, `edges`, `traversal`, and `gqlQuery`.
- Test Relay Connection pagination (`first`, `after`, `hasNextPage`).
- Test mutation resolvers with `ActorContextInput` mapping.
- Test event subscription stream mapping.

### Quality gates

- Run `bun test`, `bun run typecheck`, and `bun run lint`.
