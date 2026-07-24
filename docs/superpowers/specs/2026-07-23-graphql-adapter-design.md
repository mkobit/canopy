# Design: GraphQL protocol adapter (`canopy-1dk.5`)

## Context

The Graph API Architecture epic introduces protocol transport adapters over `@canopy/api-adapter`.
The GraphQL protocol adapter provides a schema definition language (SDL) interface, resolver engine, and transport bridge over core query handlers (`@canopy/queries`), `GraphSession` kernel mutation handlers, and real-time event log streaming interfaces.
This document specifies the GraphQL protocol adapter including GQL ISO query layer integration, GraphQL Connection pagination, type system introspection APIs, custom JSON scalars, and an agent delegation authentication and approval protocol.

## Goals / non-goals

### Goals

- Implement executable GraphQL SDL schema definitions for node, edge, traversal, type system, and ISO GQL queries.
- Support standard Relay Cursor Connection pagination (`first`, `after`, `last`, `before`, `PageInfo`, `totalCount`, `edges`) with opaque base64 cursors across graph collection queries.
- Expose GQL / Cypher ISO query execution (`gqlQuery`) delegating to `@canopy/queries`.
- Map graph type system definitions (`nodeTypes`, `edgeTypes`, `propertyTypes`, `systemIds`) for graph introspection.
- Execute graph mutations (`createNode`, `updateNodeProperties`, `deleteNode`, `createEdge`, `deleteEdge`) through `GraphSession` kernel operations.
- Support natural JSON property objects using custom `scalar JSON` and `scalar PropertyMap`.
- Implement a deep agent delegation and actor provenance model (`principalId`, `actingId`, `actorType`, `delegationToken`, `approvalState`).
- Enforce agent authorization protocols and approval gating (`AGENT_APPROVAL_REQUIRED`) when agents attempt unapproved mutations on behalf of users.
- Support real-time event streaming subscriptions (`eventStream`) over `@canopy/api-adapter` subscription interfaces.

### Non-goals

- Implementing custom non-standard GraphQL protocol extensions.
- Replacing `@canopy/queries` query engine or `EventLogStore` persistence.

## Architecture and design decisions

### Decision 1: Use `graphql` library with executable SDL schema, custom `JSON` scalar, and Relay Connection pattern

- **Rationale**: The official `graphql` JS library provides AST parsing, schema validation, and resolver execution.
  Using custom `scalar JSON` allows GraphQL clients to pass clean property maps directly.
  Standard Relay Connection types (`NodeConnection`, `EdgeConnection`, `PageInfo`) with bidirectional cursor controls (`first`, `after`, `last`, `before`) ensure standard pagination behavior across GraphQL clients.
- **Alternatives**: Stringifying property maps as raw JSON strings was rejected due to poor developer experience. Offloading pagination to offset/limit was rejected because cursor connections provide stable pagination over dynamically changing event-sourced graph states.

### Decision 2: Expose GQL ISO query layer (`gqlQuery`) over `@canopy/queries`

- **Rationale**: Canopy uses GQL / Cypher query patterns (`MATCH (n:Type) RETURN n`) in `@canopy/queries`. Exposing a dedicated `gqlQuery` field permits complex pattern matching over the projected graph and returns paginated `NodeConnection` results.
- **Alternatives**: Restricting queries strictly to hardcoded field parameters was rejected because graph consumers require flexible pattern queries.

### Decision 3: Deep agent delegation protocol and actor quadruplet provenance

- **Rationale**: When autonomous agents, subagents, or WASM plugins act on behalf of human users, event sourcing requires clear distinction between the **Principal** (the delegating user) and the **Acting Agent** (the AI subagent or plugin executing the mutation).
- **Actor Provenance Structure**:
  - `principalId`: The user or account who authorized the session.
  - `actingId`: The specific agent, subagent, plugin, or user executing the operation.
  - `actorType`: `USER` | `AGENT` | `PLUGIN` | `WORKFLOW` | `SYSTEM`.
  - `delegationToken`: Signed delegation payload or session grant verifying the agent's permission.
  - `approvalState`: `DIRECT_USER` | `APPROVED` | `PENDING_APPROVAL` | `SYSTEM_PERMITTED`.
- **Approval Protocol**:
  - Direct user operations run as `DIRECT_USER`.
  - Agent operations carrying a valid `delegationToken` execute as `APPROVED` and record quadruplet event provenance `(eventId, deviceId, principalId, actingId, delegationId, batchId)`.
  - Agent operations lacking explicit delegation or marked `PENDING_APPROVAL` are staged in `DraftSession` or rejected with `AGENT_APPROVAL_REQUIRED` GraphQL extensions error.
- **Alternatives**: Implicitly attributing all agent mutations to a generic system actor was rejected because auditability and safety require explicit agent delegation tracking.

## GraphQL Schema Definition (SDL)

```graphql
scalar JSON
scalar PropertyMap

enum ActorType {
  USER
  AGENT
  PLUGIN
  WORKFLOW
  SYSTEM
}

enum ApprovalState {
  DIRECT_USER
  APPROVED
  PENDING_APPROVAL
  SYSTEM_PERMITTED
}

input ActorContextInput {
  actingId: ID
  actorType: ActorType
  delegationToken: String
}

type ActorContext {
  principalId: ID!
  actingId: ID!
  actorType: ActorType!
  deviceId: ID
  tenantId: ID
  batchId: ID
  delegationId: ID
  approvalState: ApprovalState!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type NodePayload {
  id: ID!
  type: ID!
  properties: PropertyMap!
  createdAt: String
  updatedAt: String
  inboundEdges(type: ID, first: Int, after: String, last: Int, before: String): EdgeConnection!
  outboundEdges(type: ID, first: Int, after: String, last: Int, before: String): EdgeConnection!
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
  properties: PropertyMap!
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
  principalId: ID
  actingId: ID
  delegationId: ID
  batchId: String
  payload: JSON!
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
  actorContext: ActorContext!
}

input CreateNodeInput {
  id: ID
  type: ID!
  properties: PropertyMap!
  expectedSequence: Int
}

input UpdateNodePropertiesInput {
  id: ID!
  properties: PropertyMap!
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
  properties: PropertyMap
  expectedSequence: Int
}

input DeleteEdgeInput {
  id: ID!
  expectedSequence: Int
}

type Query {
  node(id: ID!): NodePayload
  nodes(type: ID, first: Int, after: String, last: Int, before: String): NodeConnection!
  edges(source: ID, target: ID, type: ID, first: Int, after: String, last: Int, before: String): EdgeConnection!
  traversal(startNodeIds: [ID!]!, edgeType: ID, maxDepth: Int): TraversalPayload!
  gqlQuery(query: String!, params: JSON, first: Int, after: String, last: Int, before: String): NodeConnection!
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
- Cap connection page size (`first` / `last`) to a maximum of 100 items per request.

### Failure modes and edge cases

#### Risk

Unapproved agent mutations or missing delegation tokens could result in state corruption or unauthorized graph modifications.

#### Mitigation

- Reject un-delegated agent mutations with GraphQL error code `AGENT_APPROVAL_REQUIRED` and structured details in `errors[].extensions`.
- Wrap ISO GQL query execution in defensive try-catch guards, returning structured `GraphError` extensions without throwing unhandled exceptions.
- Validate property maps using Zod schemas in `@canopy/graph` before mutation execution.

### Security and isolation

#### Risk

Untrusted agents or API clients could forge `ActorContextInput` parameters to impersonate human users or bypass tenant isolation.

#### Mitigation

- GraphQL resolvers validate `ActorContextInput` against the authenticated session `ApiAuthContext`.
- If an agent attempts to declare `actorType: USER` without matching `principalId` authentication credentials, the server forcibly rejects the request with an authorization fault.

### Migration and backward compatibility

#### Risk

Evolution of GraphQL SDL schemas could break existing client queries.

#### Mitigation

- Derive GraphQL SDL types strictly from canonical `@canopy/api-adapter` types and enforce backward compatibility in schema updates.

## Testing strategy

### Unit testing

- Test SDL schema compilation, `JSON` scalar serialization, and schema validation.
- Test query resolvers for `node`, `nodes`, `edges`, `traversal`, and `gqlQuery`.
- Test Relay Connection pagination (`first`, `after`, `last`, `before`, `hasNextPage`, `hasPreviousPage`).
- Test agent delegation validation, `ActorContext` mapping, and `AGENT_APPROVAL_REQUIRED` rejection.
- Test event subscription stream mapping.

### Quality gates

- Run `bun test`, `bun run typecheck`, and `bun run lint`.
