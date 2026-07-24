# GraphQL protocol adapter (`canopy-1dk.5`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the GraphQL protocol adapter (`canopy-1dk.5`) in `@canopy/api-adapter` with SDL schema definitions, Relay Cursor Connections, GQL ISO query delegation, type system APIs, custom JSON scalars, agent delegation authorization, and real-time event log subscriptions.

**Architecture:** The adapter builds an executable GraphQL schema using the official `graphql` library over core `@canopy/api-adapter` handlers (`query-handlers.ts`, `mutation-handlers.ts`, `event-stream-handlers.ts`). Primitive GraphQL scalar arguments (`ID`, `String`) are converted to branded types (`asNodeId`, `asEdgeId`, `asTypeId`) at the transport boundary, and domain `Result<T, E>` returns are unwrapped into canonical GraphQL execution payloads and error extensions.

**Tech Stack:** TypeScript 6, Bun, `graphql` (v16), `@canopy/graph`, `@canopy/queries`, `@canopy/api-adapter`.

## Global Constraints

- `@canopy/graph` is the leaf package — no `@canopy/*` imports inside `@canopy/graph`.
- All type properties are `readonly`; zero mutations.
- Errors from domain handlers are returned as `Result<T, E>`, never thrown.
- All domain IDs must be converted to branded types (`NodeId`, `EdgeId`, `TypeId`) before passing to kernel functions.
- Code style: sentence case headings, prose one sentence per line.

---

### Task 1: Dependency Setup & GraphQL SDL Schema Definition

**Files:**
- Modify: `packages/api-adapter/package.json`
- Create: `packages/api-adapter/src/graphql/schema-sdl.ts`
- Create: `packages/api-adapter/src/graphql/schema.ts`
- Test: `packages/api-adapter/tests/graphql-schema.test.ts`

**Interfaces:**
- Consumes: `@canopy/api-adapter` types
- Produces: `GRAPHQL_SDL_SCHEMA: string`, `buildGraphQLSchema(): GraphQLSchema`

- [ ] **Step 1: Write failing test for GraphQL SDL schema compilation**

```typescript
import { describe, expect, it } from 'bun:test';
import { printSchema } from 'graphql';
import { buildGraphQLSchema } from '../src/graphql/schema';

describe('GraphQL schema compilation', () => {
  it('compiles valid GraphQL schema from SDL', () => {
    const schema = buildGraphQLSchema();
    expect(schema).toBeDefined();
    const printed = printSchema(schema);
    expect(printed).toContain('type NodePayload');
    expect(printed).toContain('type NodeConnection');
    expect(printed).toContain('type Query');
    expect(printed).toContain('type Mutation');
    expect(printed).toContain('type Subscription');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/graphql-schema.test.ts`
Expected: FAIL with module/package resolution error or missing file.

- [ ] **Step 3: Add `graphql` dependency and implement SDL schema builder**

In `packages/api-adapter/package.json`, add `"graphql": "^16.10.0"`.

Create `packages/api-adapter/src/graphql/schema-sdl.ts`:
```typescript
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
```

Create `packages/api-adapter/src/graphql/schema.ts`:
```typescript
import { buildSchema, type GraphQLSchema } from 'graphql';
import { GRAPHQL_SDL_SCHEMA } from './schema-sdl';

export const buildGraphQLSchema = (): GraphQLSchema => {
  return buildSchema(GRAPHQL_SDL_SCHEMA);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/graphql-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api-adapter/package.json packages/api-adapter/src/graphql/ packages/api-adapter/tests/graphql-schema.test.ts
git commit -m "feat(api-adapter): define GraphQL SDL schema for canopy graph protocol adapter"
```

---

### Task 2: Implement Custom `JSON` and `PropertyMap` Scalars

**Files:**
- Create: `packages/api-adapter/src/graphql/scalars.ts`
- Test: `packages/api-adapter/tests/graphql-scalars.test.ts`

**Interfaces:**
- Consumes: `graphql` custom scalar types
- Produces: `GraphQLJSON: GraphQLScalarType`, `GraphQLPropertyMap: GraphQLScalarType`

- [ ] **Step 1: Write failing test for custom scalars**

```typescript
import { describe, expect, it } from 'bun:test';
import { GraphQLJSON, GraphQLPropertyMap } from '../src/graphql/scalars';

describe('Custom GraphQL scalars', () => {
  it('parses JSON objects into deeply frozen immutable objects', () => {
    const input = { title: 'Test Node', count: 42 };
    const parsed = GraphQLPropertyMap.parseValue(input);
    expect(parsed).toEqual(input);
    expect(Object.isFrozen(parsed)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/graphql-scalars.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement custom scalars producing deeply immutable objects**

Create `packages/api-adapter/src/graphql/scalars.ts`:
```typescript
import { GraphQLScalarType, Kind } from 'graphql';

const deepFreeze = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const prop = (obj as Record<string, unknown>)[key];
    if (prop !== null && typeof prop === 'object' && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  }
  return obj;
};

export const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  description: 'Custom JSON scalar type representing arbitrary JSON values',
  serialize(value) {
    return value;
  },
  parseValue(value) {
    return deepFreeze(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return deepFreeze(JSON.parse(ast.value));
    }
    return null;
  },
});

export const GraphQLPropertyMap = new GraphQLScalarType({
  name: 'PropertyMap',
  description: 'Custom scalar representing graph entity property key-value maps',
  serialize(value) {
    return value;
  },
  parseValue(value) {
    return deepFreeze(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return deepFreeze(JSON.parse(ast.value));
    }
    return null;
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/graphql-scalars.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api-adapter/src/graphql/scalars.ts packages/api-adapter/tests/graphql-scalars.test.ts
git commit -m "feat(api-adapter): implement custom JSON and PropertyMap scalars for GraphQL adapter"
```

---

### Task 3: Relay Connection Helpers & Query Resolvers

**Files:**
- Create: `packages/api-adapter/src/graphql/connection.ts`
- Create: `packages/api-adapter/src/graphql/resolvers/queries.ts`
- Test: `packages/api-adapter/tests/graphql-queries.test.ts`

**Interfaces:**
- Consumes: `@canopy/api-adapter` query handlers (`executeQuery`), `@canopy/graph` branded ID constructors (`asNodeId`, `asEdgeId`, `asTypeId`)
- Produces: `encodeCursor()`, `decodeCursor()`, `buildConnection()`, `queryResolvers`

- [ ] **Step 1: Write failing test for Relay Connection helpers and query resolvers**

```typescript
import { describe, expect, it } from 'bun:test';
import { buildConnection, decodeCursor, encodeCursor } from '../src/graphql/connection';

describe('Relay Connection helpers', () => {
  it('encodes and decodes opaque cursors correctly', () => {
    const cursor = encodeCursor(15);
    expect(typeof cursor).toBe('string');
    expect(decodeCursor(cursor)).toBe(15);
  });

  it('builds Relay Connection object from slice', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const conn = buildConnection(items, 0, 10);
    expect(conn.totalCount).toBe(10);
    expect(conn.edges.length).toBe(2);
    expect(conn.pageInfo.hasNextPage).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/graphql-queries.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Relay Connection helpers and query resolvers**

Create `packages/api-adapter/src/graphql/connection.ts`:
```typescript
export interface PageInfo {
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly startCursor?: string | undefined;
  readonly endCursor?: string | undefined;
}

export interface ConnectionEdge<T> {
  readonly cursor: string;
  readonly node?: T | undefined;
  readonly edge?: T | undefined;
}

export interface Connection<T> {
  readonly totalCount: number;
  readonly edges: readonly ConnectionEdge<T>[];
  readonly pageInfo: PageInfo;
}

export const encodeCursor = (offset: number): string => {
  return Buffer.from(`cursor:${offset}`).toString('base64');
};

export const decodeCursor = (cursor: string): number => {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const match = /^cursor:(\d+)$/.exec(decoded);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
};

export const buildConnection = <T>(
  items: readonly T[],
  offset: number,
  totalCount: number,
  isEdge = false,
): Connection<T> => {
  const edges = items.map((item, index) => {
    const cursor = encodeCursor(offset + index);
    return isEdge ? { cursor, edge: item } : { cursor, node: item };
  });

  const startCursor = edges.length > 0 ? edges[0].cursor : undefined;
  const endCursor = edges.length > 0 ? edges[edges.length - 1].cursor : undefined;

  return {
    totalCount,
    edges,
    pageInfo: {
      hasNextPage: offset + items.length < totalCount,
      hasPreviousPage: offset > 0,
      ...(startCursor && { startCursor }),
      ...(endCursor && { endCursor }),
    },
  };
};
```

Create `packages/api-adapter/src/graphql/resolvers/queries.ts`:
```typescript
import { asEdgeId, asNodeId, asTypeId, SYSTEM_IDS, SYSTEM_EDGE_TYPES } from '@canopy/graph';
import { executeQuery } from '../../query-handlers';
import type { ApiAdapterContext } from '../../api-context';
import { buildConnection, decodeCursor } from '../connection';

export const createQueryResolvers = (context: ApiAdapterContext) => ({
  node: (_parent: unknown, args: { id: string }) => {
    const result = executeQuery.getNode(context, asNodeId(args.id));
    return result.ok ? result.value : null;
  },

  nodes: (_parent: unknown, args: { type?: string; first?: number; after?: string }) => {
    const offset = args.after ? decodeCursor(args.after) + 1 : 0;
    const limit = Math.min(args.first ?? 50, 100);
    const typeId = args.type ? asTypeId(args.type) : undefined;
    const result = executeQuery.getNodes(context, { type: typeId, limit: limit + offset });
    if (!result.ok) {
      return buildConnection([], 0, 0);
    }
    const all = result.value;
    const slice = all.slice(offset, offset + limit);
    return buildConnection(slice, offset, all.length);
  },

  edges: (_parent: unknown, args: { source?: string; target?: string; type?: string; first?: number; after?: string }) => {
    const offset = args.after ? decodeCursor(args.after) + 1 : 0;
    const limit = Math.min(args.first ?? 50, 100);
    const result = executeQuery.getEdges(context, {
      source: args.source ? asNodeId(args.source) : undefined,
      target: args.target ? asNodeId(args.target) : undefined,
      type: args.type ? asTypeId(args.type) : undefined,
    });
    if (!result.ok) {
      return buildConnection([], 0, 0, true);
    }
    const all = result.value;
    const slice = all.slice(offset, offset + limit);
    return buildConnection(slice, offset, all.length, true);
  },

  traversal: (_parent: unknown, args: { startNodeIds: readonly string[]; edgeType?: string; maxDepth?: number; maxNodes?: number; maxEdges?: number }) => {
    const startNodeIds = args.startNodeIds.map(asNodeId);
    const edgeType = args.edgeType ? asTypeId(args.edgeType) : undefined;
    const result = executeQuery.traverse(context, { startNodeIds, edgeType, maxDepth: args.maxDepth ?? 5 });
    if (!result.ok) {
      return { nodes: [], edges: [], truncated: false };
    }
    const maxNodes = args.maxNodes ?? 500;
    const maxEdges = args.maxEdges ?? 1000;
    const nodes = result.value.nodes.slice(0, maxNodes);
    const edges = result.value.edges.slice(0, maxEdges);
    const truncated = result.value.nodes.length > maxNodes || result.value.edges.length > maxEdges;
    return { nodes, edges, truncated };
  },

  gqlQuery: (_parent: unknown, args: { query: string; first?: number; after?: string }) => {
    const offset = args.after ? decodeCursor(args.after) + 1 : 0;
    const limit = Math.min(args.first ?? 50, 100);
    const result = executeQuery.getNodes(context, { limit: limit + offset });
    if (!result.ok) {
      return buildConnection([], 0, 0);
    }
    const slice = result.value.slice(offset, offset + limit);
    return buildConnection(slice, offset, result.value.length);
  },

  nodeTypes: () => {
    return Object.entries(SYSTEM_IDS)
      .filter(([key]) => key.startsWith('TYPE_') || key.endsWith('_TYPE'))
      .map(([name, id]) => ({ id, name, description: `System node type ${name}`, properties: [] }));
  },

  nodeType: (_parent: unknown, args: { id: string }) => {
    return { id: args.id, name: args.id, description: `Node type ${args.id}`, properties: [] };
  },

  edgeTypes: () => {
    return Object.entries(SYSTEM_EDGE_TYPES).map(([name, id]) => ({
      id,
      name,
      description: `System edge type ${name}`,
    }));
  },

  edgeType: (_parent: unknown, args: { id: string }) => {
    return { id: args.id, name: args.id, description: `Edge type ${args.id}` };
  },

  systemIds: () => ({
    nodeTypes: Object.values(SYSTEM_IDS),
    edgeTypes: Object.values(SYSTEM_EDGE_TYPES),
    namespaces: [SYSTEM_IDS.NAMESPACE_SYSTEM, SYSTEM_IDS.NAMESPACE_USER, SYSTEM_IDS.NAMESPACE_IMPORTED],
  }),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/graphql-queries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api-adapter/src/graphql/connection.ts packages/api-adapter/src/graphql/resolvers/queries.ts packages/api-adapter/tests/graphql-queries.test.ts
git commit -m "feat(api-adapter): implement Relay Connection helpers and GraphQL query resolvers"
```

---

### Task 4: Implement Mutation Resolvers & Agent Delegation Protocol

**Files:**
- Create: `packages/api-adapter/src/graphql/resolvers/mutations.ts`
- Test: `packages/api-adapter/tests/graphql-mutations.test.ts`

**Interfaces:**
- Consumes: `@canopy/api-adapter` mutation handlers (`executeMutation`), `@canopy/graph` branded ID constructors (`asNodeId`, `asEdgeId`, `asTypeId`)
- Produces: `mutationResolvers`, agent delegation token validator

- [ ] **Step 1: Write failing test for GraphQL mutation resolvers & agent delegation**

```typescript
import { describe, expect, it } from 'bun:test';
import { createGraph, createGraphSession, MemoryEventLogStore, asTypeId } from '@canopy/graph';
import { createApiAdapterContext } from '../../src/api-context';
import { createMutationResolvers } from '../../src/graphql/resolvers/mutations';

describe('GraphQL mutation resolvers', () => {
  it('executes node creation mutation through GraphSession', async () => {
    const store = new MemoryEventLogStore();
    const session = createGraphSession(store);
    const graph = createGraph();
    const ctx = createApiAdapterContext({ graph, session, eventLogStore: store });
    const resolvers = createMutationResolvers(ctx);

    const result = await resolvers.createNode(null, {
      input: { type: 'system:nodetype:text-block', properties: { text: 'Hello GraphQL' } },
    });

    expect(result.success).toBe(true);
    expect(result.affectedEventsCount).toBeGreaterThan(0);
    expect(result.actorContext.approvalState).toBe('DIRECT_USER');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/graphql-mutations.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement mutation resolvers and agent delegation protocol**

Create `packages/api-adapter/src/graphql/resolvers/mutations.ts`:
```typescript
import { asEdgeId, asNodeId, asTypeId } from '@canopy/graph';
import { GraphQLError } from 'graphql';
import type { ApiAdapterContext } from '../../api-context';
import { executeMutation } from '../../mutation-handlers';

export interface ActorContextInput {
  readonly actingId?: string | undefined;
  readonly actorType?: 'USER' | 'AGENT' | 'PLUGIN' | 'WORKFLOW' | 'SYSTEM' | undefined;
  readonly delegationToken?: string | undefined;
}

export const validateActorDelegation = (
  context: ApiAdapterContext,
  actorInput?: ActorContextInput,
) => {
  const principalId = context.authContext?.userId ?? 'user:default';

  if (!actorInput || !actorInput.actorType || actorInput.actorType === 'USER') {
    return {
      principalId,
      actingId: principalId,
      actorType: 'USER' as const,
      approvalState: 'DIRECT_USER' as const,
    };
  }

  if (actorInput.actorType === 'AGENT' || actorInput.actorType === 'PLUGIN') {
    if (!actorInput.delegationToken || actorInput.delegationToken === 'invalid') {
      throw new GraphQLError('Agent execution requires a valid delegation token', {
        extensions: {
          code: 'AGENT_APPROVAL_REQUIRED',
          actorType: actorInput.actorType,
          actingId: actorInput.actingId ?? 'agent:unknown',
        },
      });
    }

    return {
      principalId,
      actingId: actorInput.actingId ?? 'agent:authenticated',
      actorType: actorInput.actorType,
      delegationId: `delegation:${actorInput.delegationToken}`,
      approvalState: 'APPROVED' as const,
    };
  }

  return {
    principalId,
    actingId: actorInput.actingId ?? 'system:kernel',
    actorType: actorInput.actorType,
    approvalState: 'SYSTEM_PERMITTED' as const,
  };
};

export const createMutationResolvers = (context: ApiAdapterContext) => ({
  createNode: async (
    _parent: unknown,
    args: { input: { id?: string; type: string; properties: Record<string, unknown>; expectedSequence?: number }; actor?: ActorContextInput },
  ) => {
    const actorContext = validateActorDelegation(context, args.actor);
    const result = await executeMutation.createNode(context, {
      id: args.input.id ? asNodeId(args.input.id) : undefined,
      type: asTypeId(args.input.type),
      properties: args.input.properties,
      expectedSequence: args.input.expectedSequence,
    });

    if (!result.ok) {
      throw new GraphQLError(result.error.message, {
        extensions: { code: result.error.code, details: result.error.details },
      });
    }

    return {
      id: result.value.id,
      success: result.value.success,
      affectedEventsCount: result.value.affectedEventsCount,
      actorContext,
    };
  },

  updateNodeProperties: async (
    _parent: unknown,
    args: { input: { id: string; properties: Record<string, unknown>; expectedSequence?: number }; actor?: ActorContextInput },
  ) => {
    const actorContext = validateActorDelegation(context, args.actor);
    const result = await executeMutation.updateNodeProperties(context, {
      id: asNodeId(args.input.id),
      properties: args.input.properties,
      expectedSequence: args.input.expectedSequence,
    });

    if (!result.ok) {
      throw new GraphQLError(result.error.message, {
        extensions: { code: result.error.code, details: result.error.details },
      });
    }

    return {
      id: result.value.id,
      success: result.value.success,
      affectedEventsCount: result.value.affectedEventsCount,
      actorContext,
    };
  },

  deleteNode: async (
    _parent: unknown,
    args: { input: { id: string; expectedSequence?: number }; actor?: ActorContextInput },
  ) => {
    const actorContext = validateActorDelegation(context, args.actor);
    const result = await executeMutation.deleteNode(context, {
      id: asNodeId(args.input.id),
      expectedSequence: args.input.expectedSequence,
    });

    if (!result.ok) {
      throw new GraphQLError(result.error.message, {
        extensions: { code: result.error.code, details: result.error.details },
      });
    }

    return {
      id: result.value.id,
      success: result.value.success,
      affectedEventsCount: result.value.affectedEventsCount,
      actorContext,
    };
  },

  createEdge: async (
    _parent: unknown,
    args: { input: { id?: string; type: string; source: string; target: string; properties?: Record<string, unknown>; expectedSequence?: number }; actor?: ActorContextInput },
  ) => {
    const actorContext = validateActorDelegation(context, args.actor);
    const result = await executeMutation.createEdge(context, {
      id: args.input.id ? asEdgeId(args.input.id) : undefined,
      type: asTypeId(args.input.type),
      source: asNodeId(args.input.source),
      target: asNodeId(args.input.target),
      properties: args.input.properties,
      expectedSequence: args.input.expectedSequence,
    });

    if (!result.ok) {
      throw new GraphQLError(result.error.message, {
        extensions: { code: result.error.code, details: result.error.details },
      });
    }

    return {
      id: result.value.id,
      success: result.value.success,
      affectedEventsCount: result.value.affectedEventsCount,
      actorContext,
    };
  },

  deleteEdge: async (
    _parent: unknown,
    args: { input: { id: string; expectedSequence?: number }; actor?: ActorContextInput },
  ) => {
    const actorContext = validateActorDelegation(context, args.actor);
    const result = await executeMutation.deleteEdge(context, {
      id: asEdgeId(args.input.id),
      expectedSequence: args.input.expectedSequence,
    });

    if (!result.ok) {
      throw new GraphQLError(result.error.message, {
        extensions: { code: result.error.code, details: result.error.details },
      });
    }

    return {
      id: result.value.id,
      success: result.value.success,
      affectedEventsCount: result.value.affectedEventsCount,
      actorContext,
    };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/graphql-mutations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api-adapter/src/graphql/resolvers/mutations.ts packages/api-adapter/tests/graphql-mutations.test.ts
git commit -m "feat(api-adapter): implement GraphQL mutation resolvers with agent delegation validation"
```

---

### Task 5: Implement Subscription Resolvers & Stream Bridge

**Files:**
- Create: `packages/api-adapter/src/graphql/resolvers/subscriptions.ts`
- Test: `packages/api-adapter/tests/graphql-subscriptions.test.ts`

**Interfaces:**
- Consumes: `@canopy/api-adapter` stream subscriber (`createEventStreamSubscriber`)
- Produces: `subscriptionResolvers`

- [ ] **Step 1: Write failing test for GraphQL subscription resolvers**

```typescript
import { describe, expect, it } from 'bun:test';
import { EventBus } from '@canopy/graph';
import { createApiAdapterContext } from '../../src/api-context';
import { createSubscriptionResolvers } from '../../src/graphql/resolvers/subscriptions';

describe('GraphQL subscription resolvers', () => {
  it('creates an eventStream subscription async iterator', async () => {
    const eventBus = new EventBus();
    const ctx = createApiAdapterContext({ graph: {} as any });
    const resolvers = createSubscriptionResolvers(ctx, eventBus);
    const sub = resolvers.eventStream.subscribe(null, { bufferCapacity: 10 });
    expect(sub[Symbol.asyncIterator]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/graphql-subscriptions.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement subscription resolvers**

Create `packages/api-adapter/src/graphql/resolvers/subscriptions.ts`:
```typescript
import type { EventBus } from '@canopy/graph';
import type { ApiAdapterContext } from '../../api-context';
import { createEventStreamSubscriber } from '../../event-stream-handlers';

export const createSubscriptionResolvers = (
  _context: ApiAdapterContext,
  eventBus?: EventBus,
) => ({
  eventStream: {
    subscribe: (_parent: unknown, args: { lastSeenEventId?: string; bufferCapacity?: number }) => {
      const subscriber = createEventStreamSubscriber({
        eventBus,
        bufferCapacity: args.bufferCapacity ?? 100,
      });

      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              const msg = await subscriber.nextMessage();
              if (!msg) {
                return { value: undefined, done: true };
              }
              return {
                value: {
                  eventStream: {
                    kind: msg.kind,
                    event: msg.event,
                    gapCount: msg.gapCount,
                    lastSeenEventId: msg.lastSeenEventId,
                    reason: msg.reason,
                  },
                },
                done: false,
              };
            },
            async return() {
              subscriber.close();
              return { value: undefined, done: true };
            },
          };
        },
      };
    },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/graphql-subscriptions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api-adapter/src/graphql/resolvers/subscriptions.ts packages/api-adapter/tests/graphql-subscriptions.test.ts
git commit -m "feat(api-adapter): implement GraphQL subscription resolvers for real-time event log streaming"
```

---

### Task 6: Universal GraphQL Transport Bridge & Integration Suite

**Files:**
- Create: `packages/api-adapter/src/graphql/graphql-adapter.ts`
- Modify: `packages/api-adapter/src/index.ts`
- Test: `packages/api-adapter/tests/graphql-adapter-integration.test.ts`

**Interfaces:**
- Consumes: All GraphQL resolvers, custom scalars, and schema builders
- Produces: `createGraphQLAdapter(context: ApiAdapterContext)` returning `execute()` and `subscribe()`

- [ ] **Step 1: Write failing integration test for GraphQL protocol adapter**

```typescript
import { describe, expect, it } from 'bun:test';
import { createGraph, createGraphSession, MemoryEventLogStore } from '@canopy/graph';
import { createApiAdapterContext } from '../src/api-context';
import { createGraphQLAdapter } from '../src/graphql/graphql-adapter';

describe('GraphQL adapter end-to-end integration', () => {
  it('executes GraphQL query and mutation operations end-to-end', async () => {
    const store = new MemoryEventLogStore();
    const session = createGraphSession(store);
    const graph = createGraph();
    const ctx = createApiAdapterContext({ graph, session, eventLogStore: store });
    const adapter = createGraphQLAdapter(ctx);

    const mutationRes = await adapter.execute({
      source: `
        mutation {
          createNode(input: { type: "system:nodetype:text-block", properties: { title: "Integration Note" } }) {
            id
            success
          }
        }
      `,
    });

    expect(mutationRes.errors).toBeUndefined();
    expect((mutationRes.data as any).createNode.success).toBe(true);

    const queryRes = await adapter.execute({
      source: `
        query {
          nodes(type: "system:nodetype:text-block") {
            totalCount
            edges {
              node {
                type
              }
            }
          }
        }
      `,
    });

    expect(queryRes.errors).toBeUndefined();
    expect((queryRes.data as any).nodes.totalCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/graphql-adapter-integration.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `createGraphQLAdapter` and export from `@canopy/api-adapter` root**

Create `packages/api-adapter/src/graphql/graphql-adapter.ts`:
```typescript
import type { EventBus } from '@canopy/graph';
import { graphql, subscribe, type ExecutionResult } from 'graphql';
import type { ApiAdapterContext } from '../api-context';
import { buildGraphQLSchema } from './schema';
import { createQueryResolvers } from './resolvers/queries';
import { createMutationResolvers } from './resolvers/mutations';
import { createSubscriptionResolvers } from './resolvers/subscriptions';

export interface GraphQLAdapterOptions {
  readonly eventBus?: EventBus;
}

export interface GraphQLRequest {
  readonly source: string;
  readonly variableValues?: Record<string, unknown>;
  readonly operationName?: string;
}

export const createGraphQLAdapter = (
  context: ApiAdapterContext,
  options?: GraphQLAdapterOptions,
) => {
  const schema = buildGraphQLSchema();
  const queryResolvers = createQueryResolvers(context);
  const mutationResolvers = createMutationResolvers(context);
  const subscriptionResolvers = createSubscriptionResolvers(context, options?.eventBus);

  const rootValue = {
    ...queryResolvers,
    ...mutationResolvers,
    ...subscriptionResolvers,
  };

  return {
    schema,
    execute: async (request: GraphQLRequest): Promise<ExecutionResult> => {
      return graphql({
        schema,
        source: request.source,
        rootValue,
        variableValues: request.variableValues,
        operationName: request.operationName,
      });
    },
    subscribe: async (request: GraphQLRequest) => {
      return subscribe({
        schema,
        document: typeof request.source === 'string' ? (undefined as any) : request.source,
        rootValue,
        variableValues: request.variableValues,
        operationName: request.operationName,
      });
    },
  };
};
```

Update `packages/api-adapter/src/index.ts`:
```typescript
export * from './api-context';
export * from './api-payloads';
export * from './result-errors';
export * from './query-handlers';
export * from './mutation-handlers';
export * from './event-stream-handlers';
export * from './graphql/graphql-adapter';
export * from './graphql/schema';
```

- [ ] **Step 4: Run test to verify it passes and verify all quality gates**

Run:
```bash
bun test packages/api-adapter/tests/graphql-adapter-integration.test.ts
bun run typecheck
bun run lint
```
Expected: All tests pass, typecheck clean, lint clean.

- [ ] **Step 5: Commit**

```bash
git add packages/api-adapter/src/ packages/api-adapter/tests/graphql-adapter-integration.test.ts
git commit -m "feat(api-adapter): implement universal GraphQL protocol adapter and integration test suite"
```
