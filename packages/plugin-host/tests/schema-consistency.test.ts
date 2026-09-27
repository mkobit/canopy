import { describe, expect, test } from 'bun:test';
import { createGraphAccessError, type GraphAccessErrorCategory } from '@canopy/graph-access';
import { CANOPY_WIT_SPECIFICATION, toWitError } from '../src';

describe('Plugin host schema consistency', () => {
  test('defines host queries, mutations, events, and the plugin world', () => {
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

  test('maps every graph access error category to WIT', () => {
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
      expect(toWitError(error).message).toBe(error.message);
    }
  });
});
