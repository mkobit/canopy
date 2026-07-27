export const GRAPHQL_SDL_SCHEMA = `
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

type EdgeEdge {
  cursor: String!
  edge: EdgePayload!
}

type EdgeConnection {
  totalCount: Int!
  edges: [EdgeEdge!]!
  pageInfo: PageInfo!
}

type TraversalPayload {
  nodes: [NodePayload!]!
  edges: [EdgePayload!]!
  truncated: Boolean!
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
  traversal(startNodeIds: [ID!]!, edgeType: ID, maxDepth: Int, maxNodes: Int, maxEdges: Int): TraversalPayload!
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
`;
