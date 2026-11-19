import { describe, expect, test } from 'bun:test';
import { createGraphAccessError, type GraphAccessErrorCategory } from '@canopy/graph-access';
import { CANOPY_WIT_SPECIFICATION, toWitError } from '../src';

describe('Plugin host schema consistency', () => {
  test('defines host queries, mutations, events, and unified host/guest plugin worlds', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('package canopy:graph;');
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
    expect(CANOPY_WIT_SPECIFICATION).toContain('commit-batch: func(');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-events');
    expect(CANOPY_WIT_SPECIFICATION).toContain('subscribe-events: func(');
    expect(CANOPY_WIT_SPECIFICATION).toContain('replay-events: func(');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-filesystem');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-http');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-secrets');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-clock');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface draft-session');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface plugin-manifest');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface plugin-lifecycle');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface content-rendering');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface wizard-execution');
    expect(CANOPY_WIT_SPECIFICATION).toContain('world graph-plugin');
    expect(CANOPY_WIT_SPECIFICATION).toContain('world server-extension-plugin');
    expect(CANOPY_WIT_SPECIFICATION).toContain('world wizard-plugin');
    expect(CANOPY_WIT_SPECIFICATION).toContain('world render-plugin');
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
