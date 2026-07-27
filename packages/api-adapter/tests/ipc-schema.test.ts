import { describe, expect, it } from 'bun:test';
import {
  CreateNodeParamsSchema as CreateNodeParametersSchema,
  EventNotificationParamsSchema as EventNotificationParametersSchema,
  GetNodeParamsSchema as GetNodeParametersSchema,
  HandshakeParamsSchema as HandshakeParametersSchema,
  IPC_METHODS,
  JSON_RPC_ERROR_CODES,
  JsonRpcRequestSchema,
  JsonRpcResponseSchema,
  SubscribeParamsSchema as SubscribeParametersSchema,
  createIpcProtocolError,
  createIpcSocketInUseError,
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
    if (parsed.success) {
      expect(parsed.data.method).toBe('canopy.v1.handshake');
      expect((parsed.data as Record<string, unknown>).extraFutureField).toBe('should_be_ignored');
    }
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
      event: { id: 'evt_1', type: 'NodeCreated' },
    });
    expect(notification.success).toBe(true);
  });
});
