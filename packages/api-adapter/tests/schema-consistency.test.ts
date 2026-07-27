import { describe, expect, test } from 'bun:test';
import {
  buildGraphQLSchema,
  CANOPY_WIT_SPECIFICATION,
  CONNECT_SERVICE_DESCRIPTORS,
  createApiAdapterError,
  GRAPHQL_SDL_SCHEMA,
  GrpcStatusCode,
  PROTO_SERVICES_SDL,
  toGraphQLExtensions,
  toGrpcStatus,
  toWitError,
} from '../src';
import type { ApiErrorCategory } from '../src';

describe('Single-source Schema Consistency Verification', () => {
  test('GraphQL schema SDL and built schema object define all core queries, mutations, and subscriptions', () => {
    const schema = buildGraphQLSchema();
    expect(schema).toBeDefined();

    expect(GRAPHQL_SDL_SCHEMA).toContain('type Query');
    expect(GRAPHQL_SDL_SCHEMA).toContain('nodes(');
    expect(GRAPHQL_SDL_SCHEMA).toContain('node(');
    expect(GRAPHQL_SDL_SCHEMA).toContain('edges(');
    expect(GRAPHQL_SDL_SCHEMA).toContain('traversal(');

    expect(GRAPHQL_SDL_SCHEMA).toContain('type Mutation');
    expect(GRAPHQL_SDL_SCHEMA).toContain('createNode(');
    expect(GRAPHQL_SDL_SCHEMA).toContain('updateNodeProperties(');
    expect(GRAPHQL_SDL_SCHEMA).toContain('deleteNode(');
    expect(GRAPHQL_SDL_SCHEMA).toContain('createEdge(');
    expect(GRAPHQL_SDL_SCHEMA).toContain('deleteEdge(');

    expect(GRAPHQL_SDL_SCHEMA).toContain('type Subscription');
    expect(GRAPHQL_SDL_SCHEMA).toContain('eventStream(');
  });

  test('Connect Protobuf SDL and service descriptors define RPC endpoints for queries, mutations, and streaming', () => {
    expect(PROTO_SERVICES_SDL).toContain('service NodeService');
    expect(PROTO_SERVICES_SDL).toContain('service EdgeService');
    expect(PROTO_SERVICES_SDL).toContain('service PropertyService');
    expect(PROTO_SERVICES_SDL).toContain('service GraphMutationService');
    expect(PROTO_SERVICES_SDL).toContain('service EventStreamService');

    expect(PROTO_SERVICES_SDL).toContain('rpc CreateNode');
    expect(PROTO_SERVICES_SDL).toContain('rpc UpdateNodeProperties');
    expect(PROTO_SERVICES_SDL).toContain('rpc DeleteNode');
    expect(PROTO_SERVICES_SDL).toContain('rpc CreateEdge');
    expect(PROTO_SERVICES_SDL).toContain('rpc DeleteEdge');

    expect(PROTO_SERVICES_SDL).toContain('rpc SubscribeEventStream');
    expect(PROTO_SERVICES_SDL).toContain('rpc ReplayEventStream');

    const serviceNames = CONNECT_SERVICE_DESCRIPTORS.map((s) => s.typeName);
    expect(serviceNames).toContain('canopy.api.v1.NodeService');
    expect(serviceNames).toContain('canopy.api.v1.EdgeService');
    expect(serviceNames).toContain('canopy.api.v1.GraphMutationService');
    expect(serviceNames).toContain('canopy.api.v1.EventStreamService');
  });

  test('WASM WIT specification defines host-queries, host-mutations, host-events, and plugin interface', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('package canopy:graph-api@0.1.0;');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface graph-types');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-queries');
    expect(CANOPY_WIT_SPECIFICATION).toContain('query-nodes: func(');
    expect(CANOPY_WIT_SPECIFICATION).toContain('query-edges: func(');
    expect(CANOPY_WIT_SPECIFICATION).toContain('traverse-graph: func(');

    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-mutations');
    expect(CANOPY_WIT_SPECIFICATION).toContain('create-node: func(');
    expect(CANOPY_WIT_SPECIFICATION).toContain('update-node-properties: func(');
    expect(CANOPY_WIT_SPECIFICATION).toContain('delete-node: func(');
    expect(CANOPY_WIT_SPECIFICATION).toContain('create-edge: func(');
    expect(CANOPY_WIT_SPECIFICATION).toContain('delete-edge: func(');

    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-events');
    expect(CANOPY_WIT_SPECIFICATION).toContain('subscribe-events: func(');
    expect(CANOPY_WIT_SPECIFICATION).toContain('replay-events: func(');

    expect(CANOPY_WIT_SPECIFICATION).toContain('world graph-plugin');
  });

  test('Canonical error translation produces consistent mapping across GraphQL, gRPC, and WIT adapters', () => {
    const categories: readonly ApiErrorCategory[] = [
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'CONCURRENCY_CONFLICT',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'RESOURCE_EXHAUSTED',
      'INTERNAL_ERROR',
    ];

    for (const category of categories) {
      const errorPayload = createApiAdapterError(category, `Test error for ${category}`);

      const gqlExtension = toGraphQLExtensions(errorPayload);
      expect(gqlExtension.category).toBe(category);

      const grpcStatus = toGrpcStatus(errorPayload);
      expect(typeof grpcStatus.code).toBe('number');
      expect(Object.values(GrpcStatusCode)).toContain(grpcStatus.code);

      const witError = toWitError(errorPayload);
      expect(witError.code).toBeDefined();
      expect(witError.message).toBe(errorPayload.message);
    }
  });
});
