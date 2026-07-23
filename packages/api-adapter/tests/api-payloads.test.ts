import { describe, expect, it, test } from 'bun:test';
import {
  asEdgeId,
  asGraphId,
  asNodeId,
  asTypeId,
  createGraph,
  isErr,
  isOk,
  unwrap,
} from '@canopy/graph';
import type {
  EdgeQueryPayload,
  NodeQueryPayload,
  PropertyLookupPayload,
  PropertyLookupResult,
  TraversalQueryPayload,
} from '../src';
import { createApiAdapterContext } from '../src/api-context';
import {
  createApiErrorResponse,
  createApiRequest,
  createApiSuccessResponse,
} from '../src/api-payloads';
import { createApiAdapterError } from '../src/result-errors';

const TEST_GRAPH_ID = asGraphId('123e4567-e89b-12d3-a456-426614174000');

describe('ApiPayloads', () => {
  it('should construct ApiRequest with explicit timestamp and context', () => {
    const graph = unwrap(createGraph(TEST_GRAPH_ID, 'Test Graph'));
    const context = createApiAdapterContext({ graph });
    const payload = { action: 'GET_NODE', nodeId: 'node-1' };
    const request = createApiRequest('req-1', context, payload, 1_700_000_000_000);

    expect(request.id).toBe('req-1');
    expect(request.context).toBe(context);
    expect(request.payload).toEqual(payload);
    expect(request.timestamp).toBe(1_700_000_000_000);
  });

  it('should construct success and error ApiResponse structures', () => {
    const successResponse = createApiSuccessResponse({ status: 'ok' });
    expect(isOk(successResponse)).toBe(true);
    if (isOk(successResponse)) {
      expect(successResponse.value).toEqual({ status: 'ok' });
    }

    const apiError = createApiAdapterError('NOT_FOUND', 'Node not found');
    const errorResponse = createApiErrorResponse(apiError);
    expect(isErr(errorResponse)).toBe(true);
    if (isErr(errorResponse)) {
      expect(errorResponse.error).toEqual(apiError);
    }
  });
});

describe('Query payload types', () => {
  test('constructs valid NodeQueryPayload', () => {
    const payload: NodeQueryPayload = {
      id: asNodeId('node-1'),
      type: asTypeId('doc'),
      limit: 10,
    };
    expect(payload.id).toBe(asNodeId('node-1'));
  });

  test('constructs valid EdgeQueryPayload', () => {
    const payload: EdgeQueryPayload = {
      id: asEdgeId('edge-1'),
      source: asNodeId('node-1'),
      target: asNodeId('node-2'),
      direction: 'out',
      limit: 5,
    };
    expect(payload.id).toBe(asEdgeId('edge-1'));
    expect(payload.direction).toBe('out');
  });

  test('constructs valid PropertyLookupPayload and Result', () => {
    const payload: PropertyLookupPayload = {
      entityId: asNodeId('node-1'),
      propertyKey: 'title',
    };
    const result: PropertyLookupResult = {
      entityId: asNodeId('node-1'),
      properties: { title: 'Test' },
    };
    expect(payload.propertyKey).toBe('title');
    expect(result.properties.title).toBe('Test');
  });

  test('constructs valid TraversalQueryPayload', () => {
    const payload: TraversalQueryPayload = {
      startNodeIds: [asNodeId('node-1')],
      maxDepth: 3,
      maxCost: 100,
    };
    expect(payload.startNodeIds).toHaveLength(1);
  });
});
