import { describe, expect, it, test } from 'bun:test';
import {
  asDeviceId,
  asEdgeId,
  asEventId,
  asGraphId,
  asInstant,
  asNodeId,
  asTypeId,
  createGraph,
  isErr,
  isOk,
  unwrap,
} from '@canopy/graph';
import type {
  EdgeCreatePayload,
  EdgeDeletePayload,
  EdgeQueryPayload,
  EventStreamMessage,
  EventStreamOptions,
  MutationResultPayload,
  NodeCreatePayload,
  NodeDeletePayload,
  NodeQueryPayload,
  NodeUpdatePropertiesPayload,
  PropertyLookupPayload,
  PropertyLookupResult,
  ReplayRequestPayload,
  StreamMessageKind,
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

describe('Mutation payload types', () => {
  test('constructs valid NodeCreatePayload', () => {
    const payload: NodeCreatePayload = {
      id: asNodeId('node-1'),
      type: asTypeId('doc'),
      properties: { title: 'Test Node' },
      expectedSequence: 1,
    };
    expect(payload.id).toBe(asNodeId('node-1'));
    expect(payload.type).toBe(asTypeId('doc'));
    expect(payload.properties.title).toBe('Test Node');
    expect(payload.expectedSequence).toBe(1);
  });

  test('constructs valid NodeUpdatePropertiesPayload', () => {
    const payload: NodeUpdatePropertiesPayload = {
      id: asNodeId('node-1'),
      properties: { title: 'Updated Title' },
      expectedSequence: 2,
    };
    expect(payload.id).toBe(asNodeId('node-1'));
    expect(payload.properties.title).toBe('Updated Title');
    expect(payload.expectedSequence).toBe(2);
  });

  test('constructs valid NodeDeletePayload', () => {
    const payload: NodeDeletePayload = {
      id: asNodeId('node-1'),
      expectedSequence: 3,
    };
    expect(payload.id).toBe(asNodeId('node-1'));
    expect(payload.expectedSequence).toBe(3);
  });

  test('constructs valid EdgeCreatePayload', () => {
    const payload: EdgeCreatePayload = {
      id: asEdgeId('edge-1'),
      type: asTypeId('references'),
      source: asNodeId('node-1'),
      target: asNodeId('node-2'),
      properties: { weight: 1 },
      expectedSequence: 1,
    };
    expect(payload.id).toBe(asEdgeId('edge-1'));
    expect(payload.type).toBe(asTypeId('references'));
    expect(payload.source).toBe(asNodeId('node-1'));
    expect(payload.target).toBe(asNodeId('node-2'));
    expect(payload.properties?.weight).toBe(1);
    expect(payload.expectedSequence).toBe(1);
  });

  test('constructs valid EdgeDeletePayload', () => {
    const payload: EdgeDeletePayload = {
      id: asEdgeId('edge-1'),
      expectedSequence: 4,
    };
    expect(payload.id).toBe(asEdgeId('edge-1'));
    expect(payload.expectedSequence).toBe(4);
  });

  test('constructs valid MutationResultPayload', () => {
    const payload: MutationResultPayload = {
      id: 'node-1',
      success: true,
      affectedEventsCount: 1,
    };
    expect(payload.id).toBe('node-1');
    expect(payload.success).toBe(true);
    expect(payload.affectedEventsCount).toBe(1);
  });
});

describe('Event Streaming Payload Definitions', () => {
  it('instantiates valid EventStreamMessage structures', () => {
    const msg: EventStreamMessage = {
      kind: 'event',
      event: {
        type: 'NodeCreated',
        eventId: asEventId('evt-1'),
        id: asNodeId('node-1'),
        nodeType: asTypeId('Markdown'),
        properties: new Map(),
        timestamp: asInstant('2024-01-01T00:00:00Z'),
        deviceId: asDeviceId('dev-1'),
      },
    };
    expect(msg.kind).toBe('event');
    expect(msg.event?.eventId).toBe(asEventId('evt-1'));
  });

  it('instantiates valid gap and disconnect message structures', () => {
    const gapMsg: EventStreamMessage = {
      kind: 'gap',
      gapCount: 15,
      lastSeenEventId: 'evt-50',
      reason: 'Replay window exceeded max limit',
    };
    const overflowMsg: EventStreamMessage = {
      kind: 'overflow_disconnect',
      gapCount: 100,
      reason: 'Subscriber buffer overflowed',
    };
    expect(gapMsg.kind).toBe('gap');
    expect(gapMsg.gapCount).toBe(15);
    expect(overflowMsg.kind).toBe('overflow_disconnect');
  });

  it('instantiates valid EventStreamOptions and ReplayRequestPayload structures', () => {
    const opts: EventStreamOptions = {
      bufferCapacity: 100,
      maxReplayCount: 50,
    };
    const replayPayload: ReplayRequestPayload = {
      tenantId: 'tenant-1',
      graphId: 'graph-1',
      lastSeenEventId: 'evt-10',
      maxReplayCount: 20,
    };
    expect(opts.bufferCapacity).toBe(100);
    expect(replayPayload.tenantId).toBe('tenant-1');
  });
});

