import { describe, expect, it } from 'bun:test';
import { asGraphId, createGraph, isErr, isOk, unwrap } from '@canopy/graph';
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
