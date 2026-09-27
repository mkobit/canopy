import { describe, expect, test } from 'bun:test';
import { createGraphAccessError, type GraphAccessErrorCategory } from '@canopy/graph-access';
import {
  buildGraphQLSchema,
  CONNECT_SERVICE_DESCRIPTORS,
  GRAPHQL_SDL_SCHEMA,
  GrpcStatusCode,
  PROTO_SERVICES_SDL,
  toGraphQLExtensions,
  toGrpcStatus,
} from '../src';

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

  test('maps every graph access error category to GraphQL and gRPC', () => {
    const categories: readonly GraphAccessErrorCategory[] = [
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'CONCURRENCY_CONFLICT',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'RESOURCE_EXHAUSTED',
      'INTERNAL_ERROR',
    ];
    for (const category of categories) {
      const error = createGraphAccessError(category, `Test error for ${category}`);
      expect(toGraphQLExtensions(error).category).toBe(category);
      expect(Object.values(GrpcStatusCode)).toContain(toGrpcStatus(error).code);
    }
  });
});
