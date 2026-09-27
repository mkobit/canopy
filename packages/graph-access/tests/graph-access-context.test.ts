import { describe, expect, it } from 'bun:test';
import { asGraphId, createGraph, unwrap } from '@canopy/graph';
import { createGraphAccessContext, defaultGraphAccessLimits } from '../src/graph-access-context';

const TEST_GRAPH_ID = asGraphId('123e4567-e89b-12d3-a456-426614174000');

describe('GraphAccessContext', () => {
  it('should create graph access context with default limits when none are specified', () => {
    const graph = unwrap(createGraph(TEST_GRAPH_ID, 'Test Graph'));
    const context = createGraphAccessContext({ graph });

    expect(context.graph).toBe(graph);
    expect(context.limits).toEqual(defaultGraphAccessLimits);
    expect(context.session).toBeUndefined();
    expect(context.eventLogStore).toBeUndefined();
    expect(context.authContext).toBeUndefined();
  });

  it('should preserve provided authContext and custom limits', () => {
    const graph = unwrap(createGraph(TEST_GRAPH_ID, 'Test Graph'));
    const authContext = {
      tenantId: 'tenant-123',
      userId: 'user-456',
      roles: ['admin'],
      scopes: ['read', 'write'],
    };
    const limits = {
      maxQueryDepth: 5,
      maxQueryCost: 500,
      maxStreamBuffer: 200,
    };

    const context = createGraphAccessContext({
      graph,
      authContext,
      limits,
    });

    expect(context.authContext).toEqual(authContext);
    expect(context.limits).toEqual(limits);
  });
});
