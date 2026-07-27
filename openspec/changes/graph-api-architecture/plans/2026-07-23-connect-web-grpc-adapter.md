# Connect-Web and gRPC Protocol Adapter (`canopy-1dk.6`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Connect-Web and gRPC protocol adapter (`canopy-1dk.6`) in `@canopy/api-adapter` with Protocol Buffer service schemas, Connect-Web RPC handlers, and gRPC event log streaming.

**Architecture:** Define Protobuf `.proto` schema definitions and service descriptors for node, edge, property, mutation, and event stream RPCs. Construct Connect-Web service RPC handlers and gRPC server streaming handlers routing requests to core `@canopy/api-adapter` query, mutation, and streaming handlers, mapping domain `Result<T, E>` types to gRPC status codes and error payloads.

**Tech Stack:** TypeScript 6, Bun, `@canopy/graph`, `@canopy/queries`, `@canopy/api-adapter`.

## Global Constraints

- `@canopy/graph` is the leaf package — no `@canopy/*` imports inside `@canopy/graph`.
- All type properties are `readonly`; zero mutations.
- Errors from domain handlers are returned as `Result<T, E>`, never thrown.
- All domain IDs must be converted to branded types (`NodeId`, `EdgeId`, `TypeId`) before passing to kernel functions.
- Code style: sentence case headings, prose one sentence per line.

---

### Task 1: Protocol Buffer Schema Definitions & Descriptor Types

**Files:**

- Create: `packages/api-adapter/src/connect/proto-sdl.ts`
- Create: `packages/api-adapter/src/connect/schema.ts`
- Test: `packages/api-adapter/tests/connect-schema.test.ts`

**Interfaces:**

- Consumes: `@canopy/api-adapter` payload definitions (`api-payloads.ts`)
- Produces: `PROTO_SERVICES_SDL: string`, `CONNECT_SERVICE_DESCRIPTORS: ReadonlyArray<ConnectServiceDescriptor>`

- [ ] **Step 1: Write failing test for Connect-Web and gRPC Protobuf schema compilation**

```typescript
import { describe, expect, it } from 'bun:test';
import { CONNECT_SERVICE_DESCRIPTORS, PROTO_SERVICES_SDL } from '../src/connect/schema';

describe('Connect Protobuf schema definition', () => {
  it('defines valid Protobuf SDL string', () => {
    expect(PROTO_SERVICES_SDL).toContain('syntax = "proto3";');
    expect(PROTO_SERVICES_SDL).toContain('service NodeService');
    expect(PROTO_SERVICES_SDL).toContain('service EdgeService');
    expect(PROTO_SERVICES_SDL).toContain('service PropertyService');
    expect(PROTO_SERVICES_SDL).toContain('service GraphMutationService');
    expect(PROTO_SERVICES_SDL).toContain('service EventStreamService');
  });

  it('provides complete Connect service descriptors', () => {
    expect(CONNECT_SERVICE_DESCRIPTORS.length).toBe(5);
    const serviceNames = CONNECT_SERVICE_DESCRIPTORS.map((descriptor) => descriptor.typeName);
    expect(serviceNames).toContain('canopy.api.v1.NodeService');
    expect(serviceNames).toContain('canopy.api.v1.EdgeService');
    expect(serviceNames).toContain('canopy.api.v1.PropertyService');
    expect(serviceNames).toContain('canopy.api.v1.GraphMutationService');
    expect(serviceNames).toContain('canopy.api.v1.EventStreamService');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/connect-schema.test.ts`
Expected: FAIL with module resolution error for missing `src/connect/schema.ts`.

- [ ] **Step 3: Implement Protobuf SDL definitions and service descriptors**

Create `packages/api-adapter/src/connect/proto-sdl.ts`:

```typescript
export const PROTO_SERVICES_SDL = `
syntax = "proto3";

package canopy.api.v1;

enum ActorType {
  ACTOR_TYPE_UNSPECIFIED = 0;
  ACTOR_TYPE_USER = 1;
  ACTOR_TYPE_AGENT = 2;
  ACTOR_TYPE_PLUGIN = 3;
  ACTOR_TYPE_WORKFLOW = 4;
  ACTOR_TYPE_SYSTEM = 5;
}

enum ApprovalState {
  APPROVAL_STATE_UNSPECIFIED = 0;
  APPROVAL_STATE_DIRECT_USER = 1;
  APPROVAL_STATE_APPROVED = 2;
  APPROVAL_STATE_PENDING_APPROVAL = 3;
  APPROVAL_STATE_SYSTEM_PERMITTED = 4;
}

message ActorContextRequest {
  string acting_id = 1;
  ActorType actor_type = 2;
  string delegation_token = 3;
}

message GetNodeByIdRequest {
  string id = 1;
  ActorContextRequest actor = 2;
}

message GetNodesByTypeRequest {
  string type_id = 1;
  ActorContextRequest actor = 2;
}

message GetNodesByPropertyRequest {
  string key = 1;
  string value_json = 2;
  ActorContextRequest actor = 3;
}

message NodeResponse {
  bool success = 1;
  string id = 2;
  string type_id = 3;
  string properties_json = 4;
  string created_at = 5;
  string updated_at = 6;
  string error_code = 7;
  string error_message = 8;
}

message NodeListResponse {
  bool success = 1;
  repeated NodeResponse nodes = 2;
  string error_code = 3;
  string error_message = 4;
}

message GetInboundEdgesRequest {
  string target_node_id = 1;
  string predicate_type_id = 2;
  ActorContextRequest actor = 3;
}

message GetOutboundEdgesRequest {
  string source_node_id = 1;
  string predicate_type_id = 2;
  ActorContextRequest actor = 3;
}

message EdgeResponse {
  bool success = 1;
  string id = 2;
  string source_node_id = 3;
  string target_node_id = 4;
  string predicate_type_id = 5;
  string properties_json = 6;
  string error_code = 7;
  string error_message = 8;
}

message EdgeListResponse {
  bool success = 1;
  repeated EdgeResponse edges = 2;
  string error_code = 3;
  string error_message = 4;
}

message ExecuteTraversalQueryRequest {
  string start_node_id = 1;
  int32 max_depth = 2;
  repeated string filter_predicate_type_ids = 3;
  ActorContextRequest actor = 4;
}

message TraversalStepResponse {
  string node_id = 1;
  int32 depth = 2;
  string matched_via_edge_id = 3;
}

message TraversalResponse {
  bool success = 1;
  repeated TraversalStepResponse steps = 2;
  string error_code = 3;
  string error_message = 4;
}

message CreateNodeRequest {
  string type_id = 1;
  string properties_json = 2;
  string expected_sequence = 3;
  ActorContextRequest actor = 4;
}

message UpdatePropertiesRequest {
  string id = 1;
  string properties_json = 2;
  string expected_sequence = 3;
  ActorContextRequest actor = 4;
}

message DeleteNodeRequest {
  string id = 1;
  string expected_sequence = 2;
  ActorContextRequest actor = 3;
}

message CreateEdgeRequest {
  string source_node_id = 1;
  string target_node_id = 2;
  string predicate_type_id = 3;
  string properties_json = 4;
  string expected_sequence = 5;
  ActorContextRequest actor = 6;
}

message DeleteEdgeRequest {
  string id = 1;
  string expected_sequence = 2;
  ActorContextRequest actor = 3;
}

message MutationResultResponse {
  bool success = 1;
  string entity_id = 2;
  int64 sequence_number = 3;
  string committed_at = 4;
  string error_code = 5;
  string error_message = 6;
}

message EventStreamRequest {
  string last_seen_event_id = 1;
  ActorContextRequest actor = 2;
}

message EventStreamItem {
  string event_id = 1;
  string event_type = 2;
  string payload_json = 3;
  int64 sequence_number = 4;
  string timestamp = 5;
}

service NodeService {
  rpc GetNodeById(GetNodeByIdRequest) returns (NodeResponse);
  rpc GetNodesByType(GetNodesByTypeRequest) returns (NodeListResponse);
  rpc GetNodesByProperty(GetNodesByPropertyRequest) returns (NodeListResponse);
}

service EdgeService {
  rpc GetInboundEdges(GetInboundEdgesRequest) returns (EdgeListResponse);
  rpc GetOutboundEdges(GetOutboundEdgesRequest) returns (EdgeListResponse);
}

service PropertyService {
  rpc ExecuteTraversalQuery(ExecuteTraversalQueryRequest) returns (TraversalResponse);
}

service GraphMutationService {
  rpc CreateNode(CreateNodeRequest) returns (MutationResultResponse);
  rpc UpdateNodeProperties(UpdatePropertiesRequest) returns (MutationResultResponse);
  rpc DeleteNode(DeleteNodeRequest) returns (MutationResultResponse);
  rpc CreateEdge(CreateEdgeRequest) returns (MutationResultResponse);
  rpc DeleteEdge(DeleteEdgeRequest) returns (MutationResultResponse);
}

service EventStreamService {
  rpc SubscribeEventStream(EventStreamRequest) returns (stream EventStreamItem);
  rpc ReplayEventStream(EventStreamRequest) returns (stream EventStreamItem);
}
`;
```

Create `packages/api-adapter/src/connect/schema.ts`:

```typescript
import { PROTO_SERVICES_SDL } from './proto-sdl';

export type ConnectServiceMethod = Readonly<{
  name: string;
  requestType: string;
  responseType: string;
  isStreaming: boolean;
}>;

export type ConnectServiceDescriptor = Readonly<{
  typeName: string;
  methods: ReadonlyArray<ConnectServiceMethod>;
}>;

export { PROTO_SERVICES_SDL };

export const CONNECT_SERVICE_DESCRIPTORS: ReadonlyArray<ConnectServiceDescriptor> = [
  {
    typeName: 'canopy.api.v1.NodeService',
    methods: [
      {
        name: 'getNodeById',
        requestType: 'GetNodeByIdRequest',
        responseType: 'NodeResponse',
        isStreaming: false,
      },
      {
        name: 'getNodesByType',
        requestType: 'GetNodesByTypeRequest',
        responseType: 'NodeListResponse',
        isStreaming: false,
      },
      {
        name: 'getNodesByProperty',
        requestType: 'GetNodesByPropertyRequest',
        responseType: 'NodeListResponse',
        isStreaming: false,
      },
    ],
  },
  {
    typeName: 'canopy.api.v1.EdgeService',
    methods: [
      {
        name: 'getInboundEdges',
        requestType: 'GetInboundEdgesRequest',
        responseType: 'EdgeListResponse',
        isStreaming: false,
      },
      {
        name: 'getOutboundEdges',
        requestType: 'GetOutboundEdgesRequest',
        responseType: 'EdgeListResponse',
        isStreaming: false,
      },
    ],
  },
  {
    typeName: 'canopy.api.v1.PropertyService',
    methods: [
      {
        name: 'executeTraversalQuery',
        requestType: 'ExecuteTraversalQueryRequest',
        responseType: 'TraversalResponse',
        isStreaming: false,
      },
    ],
  },
  {
    typeName: 'canopy.api.v1.GraphMutationService',
    methods: [
      {
        name: 'createNode',
        requestType: 'CreateNodeRequest',
        responseType: 'MutationResultResponse',
        isStreaming: false,
      },
      {
        name: 'updateNodeProperties',
        requestType: 'UpdatePropertiesRequest',
        responseType: 'MutationResultResponse',
        isStreaming: false,
      },
      {
        name: 'deleteNode',
        requestType: 'DeleteNodeRequest',
        responseType: 'MutationResultResponse',
        isStreaming: false,
      },
      {
        name: 'createEdge',
        requestType: 'CreateEdgeRequest',
        responseType: 'MutationResultResponse',
        isStreaming: false,
      },
      {
        name: 'deleteEdge',
        requestType: 'DeleteEdgeRequest',
        responseType: 'MutationResultResponse',
        isStreaming: false,
      },
    ],
  },
  {
    typeName: 'canopy.api.v1.EventStreamService',
    methods: [
      {
        name: 'subscribeEventStream',
        requestType: 'EventStreamRequest',
        responseType: 'EventStreamItem',
        isStreaming: true,
      },
      {
        name: 'replayEventStream',
        requestType: 'EventStreamRequest',
        responseType: 'EventStreamItem',
        isStreaming: true,
      },
    ],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/connect-schema.test.ts`
Expected: PASS.

---

### Task 2: gRPC Status Code & Result Error Mapping

**Files:**

- Create: `packages/api-adapter/src/connect/grpc-errors.ts`
- Test: `packages/api-adapter/tests/connect-errors.test.ts`

**Interfaces:**

- Consumes: `@canopy/api-adapter` result error types (`result-errors.ts`)
- Produces: `GrpcStatusCode`, `mapResultErrorToGrpcStatusCode`, `createConnectErrorPayload`

- [ ] **Step 1: Write failing test for gRPC status code mapping**

```typescript
import { describe, expect, it } from 'bun:test';
import { GrpcStatusCode, mapResultErrorToGrpcStatusCode } from '../src/connect/grpc-errors';

describe('gRPC status error mapper', () => {
  it('maps INVALID_INPUT and VALIDATION_ERROR to INVALID_ARGUMENT', () => {
    expect(mapResultErrorToGrpcStatusCode({ code: 'INVALID_INPUT', message: 'bad' })).toBe(
      GrpcStatusCode.INVALID_ARGUMENT,
    );
    expect(mapResultErrorToGrpcStatusCode({ code: 'VALIDATION_ERROR', message: 'bad' })).toBe(
      GrpcStatusCode.INVALID_ARGUMENT,
    );
  });

  it('maps NOT_FOUND to gRPC NOT_FOUND status', () => {
    expect(mapResultErrorToGrpcStatusCode({ code: 'NOT_FOUND', message: 'missing' })).toBe(
      GrpcStatusCode.NOT_FOUND,
    );
  });

  it('maps CONCURRENCY_CONFLICT to gRPC ABORTED status', () => {
    expect(mapResultErrorToGrpcStatusCode({ code: 'CONCURRENCY_CONFLICT', message: 'seq' })).toBe(
      GrpcStatusCode.ABORTED,
    );
  });

  it('maps UNAUTHORIZED to gRPC UNAUTHENTICATED status', () => {
    expect(mapResultErrorToGrpcStatusCode({ code: 'UNAUTHORIZED', message: 'no token' })).toBe(
      GrpcStatusCode.UNAUTHENTICATED,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/connect-errors.test.ts`
Expected: FAIL with module resolution error.

- [ ] **Step 3: Implement `grpc-errors.ts`**

Create `packages/api-adapter/src/connect/grpc-errors.ts`:

```typescript
import type { ApiAdapterErrorPayload } from '../result-errors';

export enum GrpcStatusCode {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16,
}

export type ConnectRpcError = Readonly<{
  code: GrpcStatusCode;
  errorCode: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export const mapResultErrorToGrpcStatusCode = (error: ApiAdapterErrorPayload): GrpcStatusCode => {
  switch (error.code) {
    case 'INVALID_INPUT':
    case 'VALIDATION_ERROR':
    case 'SCHEMA_VIOLATION':
      return GrpcStatusCode.INVALID_ARGUMENT;
    case 'NOT_FOUND':
    case 'NODE_NOT_FOUND':
    case 'EDGE_NOT_FOUND':
      return GrpcStatusCode.NOT_FOUND;
    case 'ALREADY_EXISTS':
    case 'DUPLICATE_ENTITY':
      return GrpcStatusCode.ALREADY_EXISTS;
    case 'CONCURRENCY_CONFLICT':
    case 'SEQUENCE_MISMATCH':
      return GrpcStatusCode.ABORTED;
    case 'UNAUTHORIZED':
      return GrpcStatusCode.UNAUTHENTICATED;
    case 'FORBIDDEN':
    case 'PERMISSION_DENIED':
      return GrpcStatusCode.PERMISSION_DENIED;
    case 'DEPTH_EXCEEDED':
    case 'RATE_LIMIT_EXCEEDED':
      return GrpcStatusCode.RESOURCE_EXHAUSTED;
    default:
      return GrpcStatusCode.INTERNAL;
  }
};

export const createConnectErrorPayload = (error: ApiAdapterErrorPayload): ConnectRpcError => {
  return {
    code: mapResultErrorToGrpcStatusCode(error),
    errorCode: error.code,
    message: error.message,
    details: error.details,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/connect-errors.test.ts`
Expected: PASS.

---

### Task 3: Connect-Web RPC Handlers for Queries and Mutations

**Files:**

- Create: `packages/api-adapter/src/connect/handlers/queries-mutations.ts`
- Test: `packages/api-adapter/tests/connect-rpc-handlers.test.ts`

**Interfaces:**

- Consumes: `@canopy/api-adapter` core query and mutation handlers (`query-handlers.ts`, `mutation-handlers.ts`)
- Produces: `createConnectQueryHandlers(context)`, `createConnectMutationHandlers(context)`

- [ ] **Step 1: Write failing integration test for Connect RPC handlers**

```typescript
import { describe, expect, it } from 'bun:test';
import { InMemoryEventLogStore } from '@canopy/storage';
import { GraphSession } from '@canopy/graph';
import { createApiAdapterContext } from '../src/api-context';
import {
  createConnectMutationHandlers,
  createConnectQueryHandlers,
} from '../src/connect/handlers/queries-mutations';

describe('Connect query and mutation RPC handlers', () => {
  it('executes createNode RPC and getNodeById RPC', async () => {
    const store = new InMemoryEventLogStore();
    const session = new GraphSession(store);
    await session.initialize();
    const context = createApiAdapterContext({ session });

    const mutationHandlers = createConnectMutationHandlers(context);
    const queryHandlers = createConnectQueryHandlers(context);

    const createRes = await mutationHandlers.createNode({
      type_id: 'concept',
      properties_json: JSON.stringify({ title: 'gRPC Node' }),
    });

    expect(createRes.success).toBe(true);
    expect(createRes.entity_id).toBeDefined();

    const getRes = await queryHandlers.getNodeById({
      id: createRes.entity_id,
    });

    expect(getRes.success).toBe(true);
    expect(getRes.id).toBe(createRes.entity_id);
    expect(getRes.type_id).toBe('concept');
    expect(getRes.properties_json).toContain('gRPC Node');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/connect-rpc-handlers.test.ts`
Expected: FAIL with missing module error.

- [ ] **Step 3: Implement Connect-Web query and mutation RPC handlers**

Create `packages/api-adapter/src/connect/handlers/queries-mutations.ts`:

```typescript
import type { ApiAdapterContext } from '../../api-context';
import { createMutationHandlers } from '../../mutation-handlers';
import { createQueryHandlers } from '../../query-handlers';
import { createConnectErrorPayload } from '../grpc-errors';

export type ConnectNodeResponse = Readonly<{
  success: boolean;
  id?: string;
  type_id?: string;
  properties_json?: string;
  created_at?: string;
  updated_at?: string;
  error_code?: string;
  error_message?: string;
}>;

export type ConnectNodeListResponse = Readonly<{
  success: boolean;
  nodes: ReadonlyArray<ConnectNodeResponse>;
  error_code?: string;
  error_message?: string;
}>;

export type ConnectEdgeResponse = Readonly<{
  success: boolean;
  id?: string;
  source_node_id?: string;
  target_node_id?: string;
  predicate_type_id?: string;
  properties_json?: string;
  error_code?: string;
  error_message?: string;
}>;

export type ConnectEdgeListResponse = Readonly<{
  success: boolean;
  edges: ReadonlyArray<ConnectEdgeResponse>;
  error_code?: string;
  error_message?: string;
}>;

export type ConnectTraversalResponse = Readonly<{
  success: boolean;
  steps: ReadonlyArray<{
    node_id: string;
    depth: number;
    matched_via_edge_id?: string;
  }>;
  error_code?: string;
  error_message?: string;
}>;

export type ConnectMutationResultResponse = Readonly<{
  success: boolean;
  entity_id?: string;
  sequence_number?: number;
  committed_at?: string;
  error_code?: string;
  error_message?: string;
}>;

export const createConnectQueryHandlers = (context: ApiAdapterContext) => {
  const queryHandlers = createQueryHandlers(context);

  return {
    getNodeById: async (req: { id: string }): Promise<ConnectNodeResponse> => {
      const res = await queryHandlers.getNodeById(req.id);
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        id: res.value.id,
        type_id: res.value.typeId,
        properties_json: JSON.stringify(res.value.properties),
        created_at: res.value.createdAt,
        updated_at: res.value.updatedAt,
      };
    },

    getNodesByType: async (req: { type_id: string }): Promise<ConnectNodeListResponse> => {
      const res = await queryHandlers.getNodesByType(req.type_id);
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, nodes: [], error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        nodes: res.value.map((n) => ({
          success: true,
          id: n.id,
          type_id: n.typeId,
          properties_json: JSON.stringify(n.properties),
          created_at: n.createdAt,
          updated_at: n.updatedAt,
        })),
      };
    },

    getNodesByProperty: async (req: {
      key: string;
      value_json: string;
    }): Promise<ConnectNodeListResponse> => {
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(req.value_json);
      } catch {
        parsedValue = req.value_json;
      }
      const res = await queryHandlers.getNodesByProperty(req.key, parsedValue);
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, nodes: [], error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        nodes: res.value.map((n) => ({
          success: true,
          id: n.id,
          type_id: n.typeId,
          properties_json: JSON.stringify(n.properties),
          created_at: n.createdAt,
          updated_at: n.updatedAt,
        })),
      };
    },

    getInboundEdges: async (req: {
      target_node_id: string;
      predicate_type_id?: string;
    }): Promise<ConnectEdgeListResponse> => {
      const res = await queryHandlers.getInboundEdges(req.target_node_id, req.predicate_type_id);
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, edges: [], error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        edges: res.value.map((e) => ({
          success: true,
          id: e.id,
          source_node_id: e.sourceNodeId,
          target_node_id: e.targetNodeId,
          predicate_type_id: e.predicateTypeId,
          properties_json: JSON.stringify(e.properties),
        })),
      };
    },

    getOutboundEdges: async (req: {
      source_node_id: string;
      predicate_type_id?: string;
    }): Promise<ConnectEdgeListResponse> => {
      const res = await queryHandlers.getOutboundEdges(req.source_node_id, req.predicate_type_id);
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, edges: [], error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        edges: res.value.map((e) => ({
          success: true,
          id: e.id,
          source_node_id: e.sourceNodeId,
          target_node_id: e.targetNodeId,
          predicate_type_id: e.predicateTypeId,
          properties_json: JSON.stringify(e.properties),
        })),
      };
    },

    executeTraversalQuery: async (req: {
      start_node_id: string;
      max_depth?: number;
      filter_predicate_type_ids?: ReadonlyArray<string>;
    }): Promise<ConnectTraversalResponse> => {
      const res = await queryHandlers.executeTraversalQuery({
        startNodeId: req.start_node_id,
        maxDepth: req.max_depth,
        filterPredicateTypeIds: req.filter_predicate_type_ids,
      });
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, steps: [], error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        steps: res.value.map((s) => ({
          node_id: s.nodeId,
          depth: s.depth,
          matched_via_edge_id: s.matchedViaEdgeId,
        })),
      };
    },
  };
};

export const createConnectMutationHandlers = (context: ApiAdapterContext) => {
  const mutationHandlers = createMutationHandlers(context);

  return {
    createNode: async (req: {
      type_id: string;
      properties_json?: string;
      expected_sequence?: string;
    }): Promise<ConnectMutationResultResponse> => {
      const properties = req.properties_json ? JSON.parse(req.properties_json) : {};
      const expectedSequenceNumber = req.expected_sequence
        ? Number.parseInt(req.expected_sequence, 10)
        : undefined;
      const res = await mutationHandlers.createNode({
        typeId: req.type_id,
        properties,
        expectedSequenceNumber,
      });
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        entity_id: res.value.entityId,
        sequence_number: res.value.sequenceNumber,
        committed_at: res.value.committedAt,
      };
    },

    updateNodeProperties: async (req: {
      id: string;
      properties_json: string;
      expected_sequence?: string;
    }): Promise<ConnectMutationResultResponse> => {
      const properties = JSON.parse(req.properties_json);
      const expectedSequenceNumber = req.expected_sequence
        ? Number.parseInt(req.expected_sequence, 10)
        : undefined;
      const res = await mutationHandlers.updateNodeProperties({
        id: req.id,
        properties,
        expectedSequenceNumber,
      });
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        entity_id: res.value.entityId,
        sequence_number: res.value.sequenceNumber,
        committed_at: res.value.committedAt,
      };
    },

    deleteNode: async (req: {
      id: string;
      expected_sequence?: string;
    }): Promise<ConnectMutationResultResponse> => {
      const expectedSequenceNumber = req.expected_sequence
        ? Number.parseInt(req.expected_sequence, 10)
        : undefined;
      const res = await mutationHandlers.deleteNode({
        id: req.id,
        expectedSequenceNumber,
      });
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        entity_id: res.value.entityId,
        sequence_number: res.value.sequenceNumber,
        committed_at: res.value.committedAt,
      };
    },

    createEdge: async (req: {
      source_node_id: string;
      target_node_id: string;
      predicate_type_id: string;
      properties_json?: string;
      expected_sequence?: string;
    }): Promise<ConnectMutationResultResponse> => {
      const properties = req.properties_json ? JSON.parse(req.properties_json) : {};
      const expectedSequenceNumber = req.expected_sequence
        ? Number.parseInt(req.expected_sequence, 10)
        : undefined;
      const res = await mutationHandlers.createEdge({
        sourceNodeId: req.source_node_id,
        targetNodeId: req.target_node_id,
        predicateTypeId: req.predicate_type_id,
        properties,
        expectedSequenceNumber,
      });
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        entity_id: res.value.entityId,
        sequence_number: res.value.sequenceNumber,
        committed_at: res.value.committedAt,
      };
    },

    deleteEdge: async (req: {
      id: string;
      expected_sequence?: string;
    }): Promise<ConnectMutationResultResponse> => {
      const expectedSequenceNumber = req.expected_sequence
        ? Number.parseInt(req.expected_sequence, 10)
        : undefined;
      const res = await mutationHandlers.deleteEdge({
        id: req.id,
        expectedSequenceNumber,
      });
      if (!res.ok) {
        const err = createConnectErrorPayload(res.error);
        return { success: false, error_code: err.errorCode, error_message: err.message };
      }
      return {
        success: true,
        entity_id: res.value.entityId,
        sequence_number: res.value.sequenceNumber,
        committed_at: res.value.committedAt,
      };
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/connect-rpc-handlers.test.ts`
Expected: PASS.

---

### Task 4: gRPC Event Log Streaming & Replay Handlers

**Files:**

- Create: `packages/api-adapter/src/connect/handlers/event-streaming.ts`
- Test: `packages/api-adapter/tests/connect-event-streaming.test.ts`

**Interfaces:**

- Consumes: `event-stream-handlers.ts`, `EventBus`
- Produces: `createConnectEventStreamHandlers(context, options)` returning gRPC server streaming iterators for `subscribeEventStream` and `replayEventStream`.

- [ ] **Step 1: Write failing test for event log streaming and replay**

```typescript
import { describe, expect, it } from 'bun:test';
import { EventBus, GraphSession } from '@canopy/graph';
import { InMemoryEventLogStore } from '@canopy/storage';
import { createApiAdapterContext } from '../src/api-context';
import { createConnectEventStreamHandlers } from '../src/connect/handlers/event-streaming';

describe('Connect gRPC event streaming handlers', () => {
  it('streams live events via subscribeEventStream iterator', async () => {
    const store = new InMemoryEventLogStore();
    const eventBus = new EventBus();
    const session = new GraphSession(store);
    await session.initialize();
    const context = createApiAdapterContext({ session });

    const streamHandlers = createConnectEventStreamHandlers(context, { eventBus });
    const iterator = streamHandlers.subscribeEventStream({});

    const createPromise = session.createNode('topic', { name: 'Streamed' });
    const nextItem = await iterator.next();

    await createPromise;
    expect(nextItem.done).toBe(false);
    expect(nextItem.value?.event_type).toBe('NODE_CREATED');
    expect(nextItem.value?.payload_json).toContain('Streamed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/connect-event-streaming.test.ts`
Expected: FAIL with module resolution error.

- [ ] **Step 3: Implement `event-streaming.ts`**

Create `packages/api-adapter/src/connect/handlers/event-streaming.ts`:

```typescript
import type { EventBus } from '@canopy/graph';
import type { ApiAdapterContext } from '../../api-context';
import { createEventStreamHandlers } from '../../event-stream-handlers';

export type ConnectEventStreamItem = Readonly<{
  event_id: string;
  event_type: string;
  payload_json: string;
  sequence_number: number;
  timestamp: string;
}>;

export type ConnectEventStreamOptions = Readonly<{
  eventBus?: EventBus;
}>;

export const createConnectEventStreamHandlers = (
  context: ApiAdapterContext,
  options?: ConnectEventStreamOptions,
) => {
  const streamHandlers = createEventStreamHandlers(context, options?.eventBus);

  return {
    subscribeEventStream: (req: {
      last_seen_event_id?: string;
    }): AsyncIterator<ConnectEventStreamItem> => {
      const coreStream = streamHandlers.subscribeEventStream(req.last_seen_event_id);
      return (async function* () {
        for await (const event of coreStream) {
          yield {
            event_id: event.eventId,
            event_type: event.eventType,
            payload_json: JSON.stringify(event.payload),
            sequence_number: event.sequenceNumber,
            timestamp: event.timestamp,
          };
        }
      })();
    },

    replayEventStream: (req: {
      last_seen_event_id?: string;
    }): AsyncIterator<ConnectEventStreamItem> => {
      const coreReplay = streamHandlers.replayEventStream(req.last_seen_event_id);
      return (async function* () {
        for await (const event of coreReplay) {
          yield {
            event_id: event.eventId,
            event_type: event.eventType,
            payload_json: JSON.stringify(event.payload),
            sequence_number: event.sequenceNumber,
            timestamp: event.timestamp,
          };
        }
      })();
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/connect-event-streaming.test.ts`
Expected: PASS.

---

### Task 5: Connect-Web/gRPC Adapter Assembly & Package Exports

**Files:**

- Create: `packages/api-adapter/src/connect/connect-adapter.ts`
- Modify: `packages/api-adapter/src/index.ts`
- Test: `packages/api-adapter/tests/connect-adapter.test.ts`

**Interfaces:**

- Consumes: All `src/connect/` modules
- Produces: `createConnectAdapter(context, options)`, `ConnectAdapter`, full package exports in `src/index.ts`.

- [ ] **Step 1: Write failing test for overall Connect-Web adapter assembly**

```typescript
import { describe, expect, it } from 'bun:test';
import { InMemoryEventLogStore } from '@canopy/storage';
import { GraphSession } from '@canopy/graph';
import { createApiAdapterContext, createConnectAdapter } from '../src';

describe('ConnectAdapter complete service assembly', () => {
  it('instantiates and provides all RPC service implementations', async () => {
    const store = new InMemoryEventLogStore();
    const session = new GraphSession(store);
    await session.initialize();
    const context = createApiAdapterContext({ session });

    const adapter = createConnectAdapter(context);
    expect(adapter.descriptors.length).toBe(5);
    expect(adapter.services.nodeService).toBeDefined();
    expect(adapter.services.edgeService).toBeDefined();
    expect(adapter.services.propertyService).toBeDefined();
    expect(adapter.services.mutationService).toBeDefined();
    expect(adapter.services.eventStreamService).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/connect-adapter.test.ts`
Expected: FAIL with `createConnectAdapter` undefined.

- [ ] **Step 3: Implement `connect-adapter.ts` and update `index.ts`**

Create `packages/api-adapter/src/connect/connect-adapter.ts`:

```typescript
import type { EventBus } from '@canopy/graph';
import type { ApiAdapterContext } from '../api-context';
import {
  createConnectEventStreamHandlers,
  type ConnectEventStreamItem,
} from './handlers/event-streaming';
import {
  createConnectMutationHandlers,
  createConnectQueryHandlers,
  type ConnectEdgeListResponse,
  type ConnectMutationResultResponse,
  type ConnectNodeListResponse,
  type ConnectNodeResponse,
  type ConnectTraversalResponse,
} from './handlers/queries-mutations';

import {
  CONNECT_SERVICE_DESCRIPTORS,
  PROTO_SERVICES_SDL,
  type ConnectServiceDescriptor,
} from './schema';

export type ConnectAdapterOptions = Readonly<{
  eventBus?: EventBus;
}>;

export type ConnectAdapterServices = Readonly<{
  nodeService: ReturnType<typeof createConnectQueryHandlers>;
  edgeService: ReturnType<typeof createConnectQueryHandlers>;
  propertyService: ReturnType<typeof createConnectQueryHandlers>;
  mutationService: ReturnType<typeof createConnectMutationHandlers>;
  eventStreamService: ReturnType<typeof createConnectEventStreamHandlers>;
}>;

export type ConnectAdapter = Readonly<{
  protoSdl: string;
  descriptors: ReadonlyArray<ConnectServiceDescriptor>;
  services: ConnectAdapterServices;
}>;

export const createConnectAdapter = (
  context: ApiAdapterContext,
  options?: ConnectAdapterOptions,
): ConnectAdapter => {
  const queryHandlers = createConnectQueryHandlers(context);
  const mutationHandlers = createConnectMutationHandlers(context);
  const eventStreamHandlers = createConnectEventStreamHandlers(context, options);

  return {
    protoSdl: PROTO_SERVICES_SDL,
    descriptors: CONNECT_SERVICE_DESCRIPTORS,
    services: {
      nodeService: queryHandlers,
      edgeService: queryHandlers,
      propertyService: queryHandlers,
      mutationService: mutationHandlers,
      eventStreamService: eventStreamHandlers,
    },
  };
};
```

Update `packages/api-adapter/src/index.ts` to export all Connect adapter items:

```typescript
export * from './api-context';
export * from './api-payloads';
export * from './connect/connect-adapter';
export * from './connect/grpc-errors';
export * from './connect/handlers/event-streaming';
export * from './connect/handlers/queries-mutations';
export * from './connect/proto-sdl';
export * from './connect/schema';
export * from './event-stream-handlers';
export * from './graphql/graphql-adapter';
export * from './mutation-handlers';
export * from './query-handlers';
export * from './result-errors';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/connect-adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Run complete quality gates**

Run: `bun test`, `bun run build`, `bun run lint`, and `bun run typecheck`.
Expected: All tests pass cleanly across `@canopy/api-adapter` and the rest of the workspace.
