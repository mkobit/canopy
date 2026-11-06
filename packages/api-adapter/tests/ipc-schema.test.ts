import { describe, expect, it } from 'bun:test';
import {
  asDeviceId,
  asEdgeId,
  asEventId,
  asGraphId,
  asInstant,
  asNodeId,
  asTypeId,
} from '@canopy/graph';
import type { GraphEvent, PropertyValue } from '@canopy/graph';
import {
  CreateNodeParamsSchema as CreateNodeParametersSchema,
  EventNotificationParamsSchema as EventNotificationParametersSchema,
  GetNodeParamsSchema as GetNodeParametersSchema,
  HandshakeParamsSchema as HandshakeParametersSchema,
  IPC_METHODS,
  IpcGraphEventSchema,
  IpcPropertyMapSchema,
  JSON_RPC_ERROR_CODES,
  JsonRpcRequestSchema,
  JsonRpcResponseSchema,
  SubscribeParamsSchema as SubscribeParametersSchema,
  createIpcProtocolError,
  createIpcSocketInUseError,
  deserializeIpcGraphEvent,
  serializeGraphEventForIpc,
} from '../src/ipc/ipc-schema';

describe('IPC schema and protocol definitions', () => {
  it('defines valid JSON-RPC 2.0 error codes', () => {
    expect(JSON_RPC_ERROR_CODES.PARSE_ERROR).toBe(-32_700);
    expect(JSON_RPC_ERROR_CODES.INVALID_REQUEST).toBe(-32_600);
    expect(JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND).toBe(-32_601);
    expect(JSON_RPC_ERROR_CODES.INVALID_PARAMS).toBe(-32_602);
    expect(JSON_RPC_ERROR_CODES.INTERNAL_ERROR).toBe(-32_603);
    expect(JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR).toBe(-32_000);
  });

  it('creates domain errors with tagged union types', () => {
    const socketError = createIpcSocketInUseError('/tmp/canopy.sock');
    expect(socketError._tag).toBe('IpcSocketInUseError');
    expect(socketError.socketPath).toBe('/tmp/canopy.sock');

    const prototypeError = createIpcProtocolError(
      JSON_RPC_ERROR_CODES.INVALID_PARAMS,
      'Invalid params provided',
      { field: 'id' },
    );
    expect(prototypeError._tag).toBe('IpcProtocolError');
    expect(prototypeError.code).toBe(-32_602);
    expect(prototypeError.details).toEqual({ field: 'id' });
  });

  it('validates JSON-RPC requests and allows unknown properties (passthrough)', () => {
    const validRequest = {
      jsonrpc: '2.0',
      method: IPC_METHODS.HANDSHAKE,
      params: { clientVersion: '0.1.0' },
      id: 1,
      extraFutureField: 'should_be_ignored',
    };

    const parsed = JsonRpcRequestSchema.safeParse(validRequest);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data.method).toBe('canopy.v1.handshake');
    expect((parsed.data as Record<string, unknown>).extraFutureField).toBe('should_be_ignored');
  });

  it('validates JSON-RPC responses and error payloads', () => {
    const validResponse = {
      jsonrpc: '2.0',
      result: { apiVersion: 'v1' },
      id: 1,
    };
    expect(JsonRpcResponseSchema.safeParse(validResponse).success).toBe(true);

    const errorResponse = {
      jsonrpc: '2.0',
      error: {
        code: -32_601,
        message: 'Method not found',
      },
      id: 2,
    };
    expect(JsonRpcResponseSchema.safeParse(errorResponse).success).toBe(true);
  });

  it('validates handshake parameters with defaults', () => {
    const parsed = HandshakeParametersSchema.safeParse({ clientVersion: '1.0.0' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.supportedCapabilities).toEqual([]);
    }
  });

  it('validates query and mutation method parameters', () => {
    const nodeParameters = GetNodeParametersSchema.safeParse({ id: 'node_123' });
    expect(nodeParameters.success).toBe(true);

    const createParameters = CreateNodeParametersSchema.safeParse({
      type: 'concept',
      properties: { title: 'Test Node' },
      unknownAdditiveProperty: 'allowed',
    });
    expect(createParameters.success).toBe(true);

    const subParameters = SubscribeParametersSchema.safeParse({ fromSequence: 0 });
    expect(subParameters.success).toBe(true);

    const notification = EventNotificationParametersSchema.safeParse({
      subscriptionId: 'sub_1',
      event: {
        type: 'NodeCreated',
        eventId: '00000000-0000-4000-8000-000000000001',
        id: 'node_1',
        nodeType: 'type:note',
        properties: { title: 'Hello' },
        timestamp: '2026-11-04T00:00:00.000Z',
        deviceId: '00000000-0000-4000-8000-000000000002',
        futureVariantField: 'preserved',
      },
    });
    expect(notification.success).toBe(true);
    if (notification.success) {
      expect((notification.data.event as Record<string, unknown>).futureVariantField).toBe(
        'preserved',
      );
    }

    const malformedNotification = EventNotificationParametersSchema.safeParse({
      subscriptionId: 'sub_1',
      event: { id: 'evt_1', type: 'NodeCreated' },
    });
    expect(malformedNotification.success).toBe(false);
  });

  it('serializes and round-trips all eight GraphEvent variants with and without optional fields', () => {
    const timestamp = asInstant('2026-11-04T00:00:00.000Z');
    const deviceId = asDeviceId('00000000-0000-4000-8000-000000000010');
    const externalGraphId = asGraphId('00000000-0000-4000-8000-000000000099');
    const richProperties: ReadonlyMap<string, PropertyValue> = new Map<string, PropertyValue>([
      ['title', 'Canopy IPC'],
      ['emptyString', ''],
      ['zero', 0],
      ['negative', -42],
      ['float', 3.25],
      ['boolFalse', false],
      ['boolTrue', true],
      ['nullable', null],
      ['externalRef', { graph: externalGraphId, target: asNodeId('target-node-1') }],
      [
        'arrayValues',
        [
          'tag-1',
          '',
          0,
          false,
          null,
          { graph: externalGraphId, target: asNodeId('target-node-2') },
        ],
      ],
    ]);

    const baseVariants: readonly GraphEvent[] = [
      {
        type: 'NodeCreated',
        eventId: asEventId('00000000-0000-4000-8000-000000000001'),
        id: asNodeId('node-1'),
        nodeType: asTypeId('type:note'),
        properties: richProperties,
        timestamp,
        deviceId,
      },
      {
        type: 'NodePropertiesUpdated',
        eventId: asEventId('00000000-0000-4000-8000-000000000002'),
        id: asNodeId('node-1'),
        changes: richProperties,
        timestamp,
        deviceId,
      },
      {
        type: 'NodeDeleted',
        eventId: asEventId('00000000-0000-4000-8000-000000000003'),
        id: asNodeId('node-1'),
        timestamp,
        deviceId,
      },
      {
        type: 'EdgeCreated',
        eventId: asEventId('00000000-0000-4000-8000-000000000004'),
        id: asEdgeId('edge-1'),
        edgeType: asTypeId('type:links-to'),
        source: asNodeId('node-1'),
        target: asNodeId('node-2'),
        properties: richProperties,
        timestamp,
        deviceId,
      },
      {
        type: 'EdgePropertiesUpdated',
        eventId: asEventId('00000000-0000-4000-8000-000000000005'),
        id: asEdgeId('edge-1'),
        changes: new Map<string, PropertyValue>(),
        timestamp,
        deviceId,
      },
      {
        type: 'EdgeDeleted',
        eventId: asEventId('00000000-0000-4000-8000-000000000006'),
        id: asEdgeId('edge-1'),
        timestamp,
        deviceId,
      },
      {
        type: 'WorkflowStarted',
        eventId: asEventId('00000000-0000-4000-8000-000000000007'),
        workflowId: asNodeId('workflow-1'),
        triggerId: asNodeId('trigger-1'),
        timestamp,
        deviceId,
      },
      {
        type: 'WorkflowCompleted',
        eventId: asEventId('00000000-0000-4000-8000-000000000008'),
        executionId: asEventId('00000000-0000-4000-8000-000000000088'),
        timestamp,
        deviceId,
      },
    ];

    const withOptionalVariants: readonly GraphEvent[] = baseVariants.map((event) =>
      event.type === 'WorkflowStarted' || event.type === 'WorkflowCompleted'
        ? { ...event, batchId: 'batch-1' }
        : { ...event, batchId: 'batch-1', migrationId: 'migration-1' },
    );

    for (const domainEvent of [...baseVariants, ...withOptionalVariants]) {
      const wireEvent = serializeGraphEventForIpc(domainEvent);

      // Risk B1: No keys with undefined values
      for (const value of Object.values(wireEvent)) {
        expect(value).not.toBeUndefined();
      }

      const inMemoryValidation = IpcGraphEventSchema.safeParse(wireEvent);
      expect(inMemoryValidation.success).toBe(true);

      const wireJson = JSON.stringify(wireEvent);
      const jsonRoundTrip = JSON.parse(wireJson) as unknown;
      const wireValidation = IpcGraphEventSchema.safeParse(jsonRoundTrip);
      expect(wireValidation.success).toBe(true);

      const decoded = deserializeIpcGraphEvent(jsonRoundTrip);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.value).toEqual(domainEvent);
      }
    }
  });

  it('preserves __proto__ and constructor property keys without prototype pollution', () => {
    const timestamp = asInstant('2026-11-04T00:00:00.000Z');
    const deviceId = asDeviceId('00000000-0000-4000-8000-000000000010');
    const properties = new Map<string, PropertyValue>([
      ['__proto__', 'proto-scalar-value'],
      ['constructor', 'constructor-scalar-value'],
      ['normal', 'normal-value'],
    ]);

    const domainEvent: GraphEvent = {
      type: 'NodeCreated',
      eventId: asEventId('00000000-0000-4000-8000-000000000001'),
      id: asNodeId('node-proto'),
      nodeType: asTypeId('type:note'),
      properties,
      timestamp,
      deviceId,
    };

    const wireEvent = serializeGraphEventForIpc(domainEvent);
    expect(wireEvent.type).toBe('NodeCreated');
    if (wireEvent.type === 'NodeCreated') {
      expect(Object.prototype.hasOwnProperty.call(wireEvent.properties, '__proto__')).toBe(true);
      expect(Object.getOwnPropertyDescriptor(wireEvent.properties, '__proto__')?.value).toBe(
        'proto-scalar-value',
      );
      expect(IpcPropertyMapSchema.safeParse(wireEvent.properties).success).toBe(true);
    }

    const wireJson = JSON.stringify(wireEvent);
    const overTheWire = JSON.parse(wireJson) as unknown;
    const decoded = deserializeIpcGraphEvent(overTheWire);
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.value.type === 'NodeCreated') {
      expect(decoded.value.properties.get('__proto__')).toBe('proto-scalar-value');
      expect(decoded.value.properties.get('constructor')).toBe('constructor-scalar-value');
      expect(decoded.value.properties.get('normal')).toBe('normal-value');
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('returns an INVALID_PARAMS IpcProtocolError when deserializeIpcGraphEvent fails', () => {
    const result = deserializeIpcGraphEvent({ type: 'NodeCreated', id: 'missing-fields' });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error._tag).toBe('IpcProtocolError');
    expect(result.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_PARAMS);
  });
});
