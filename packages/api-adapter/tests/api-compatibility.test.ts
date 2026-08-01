import { describe, expect, test } from 'bun:test';
import { checkApiCompatibility } from '../../../tools/lib/api-compatibility-checker';

describe('API Compatibility Checker Engine', () => {
  test('passes clean verification against unchanged baselines', () => {
    const result = checkApiCompatibility();
    expect(result.success).toBe(true);
    expect(result.violations.length).toEqual(0);
  });

  test('detects breaking GraphQL field removal', () => {
    const modifiedGql = `
      type Query {
        node(id: ID!): NodePayload
      }
    `;
    const result = checkApiCompatibility({
      overrideGql: modifiedGql,
    });
    expect(result.success).toBe(false);
    expect(result.violations.some((v) => v.protocol === 'graphql')).toBe(true);
  });

  test('detects GraphQL output non-null relaxation', () => {
    const modifiedGql = `
      type Query {
        node(id: ID!): NodePayload
        nodes(type: ID, first: Int, after: String, last: Int, before: String): NodeConnection
      }
    `;
    const result = checkApiCompatibility({
      overrideGql: modifiedGql,
    });
    expect(result.success).toBe(false);
    expect(
      result.violations.some(
        (v) => v.protocol === 'graphql' && v.changeType === 'NON_NULL_RELAXATION',
      ),
    ).toBe(true);
  });

  test('detects input argument non-null tightening', () => {
    const modifiedGql = `
      type Query {
        nodes(type: ID!, first: Int, after: String, last: Int, before: String): NodeConnection!
      }
    `;
    const result = checkApiCompatibility({
      overrideGql: modifiedGql,
    });
    expect(result.success).toBe(false);
    expect(
      result.violations.some(
        (v) => v.protocol === 'graphql' && v.changeType === 'NON_NULL_TIGHTENING',
      ),
    ).toBe(true);
  });

  test('detects Protobuf field removal', () => {
    const modifiedPrototype = `
      message NodeResponse {
        bool success = 1;
        string id = 2;
      }
    `;
    const result = checkApiCompatibility({
      overrideProto: modifiedPrototype,
    });
    expect(result.success).toBe(false);
    expect(
      result.violations.some((v) => v.protocol === 'connect' && v.changeType === 'FIELD_REMOVAL'),
    ).toBe(true);
  });

  test('detects Protobuf tag shift', () => {
    const modifiedPrototype = `
      message NodeResponse {
        bool success = 2;
        string id = 1;
      }
    `;
    const result = checkApiCompatibility({
      overrideProto: modifiedPrototype,
    });
    expect(result.success).toBe(false);
    expect(
      result.violations.some((v) => v.protocol === 'connect' && v.changeType === 'TAG_SHIFT'),
    ).toBe(true);
  });

  test('detects WIT function removal and signature changes', () => {
    const modifiedWit = `
      interface host-queries {
        use graph-types.{capability-token, adapter-error};
        query-nodes: func(token: capability-token) -> result<string, adapter-error>;
      }
    `;
    const result = checkApiCompatibility({
      overrideWit: modifiedWit,
    });
    expect(result.success).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          v.protocol === 'wit' &&
          (v.changeType === 'FUNCTION_REMOVAL' || v.changeType === 'SIGNATURE_CHANGE'),
      ),
    ).toBe(true);
  });

  test('accepts approved breaking change with valid waiver', () => {
    const modifiedGql = `
      type Query {
        node(id: ID!): NodePayload
      }
    `;
    const waivers = [
      {
        id: 'WAIVER-001',
        protocol: 'graphql' as const,
        path: 'Query.nodes',
        changeType: 'REMOVAL',
        reason: 'Testing waiver approval',
        author: '@test',
        expiresAt: '2099-01-01',
        ticket: 'canopy-1dk.10',
      },
    ];
    const result = checkApiCompatibility({
      overrideGql: modifiedGql,
      overrideWaivers: waivers,
    });
    expect(result.approvedWaivers.length).toBeGreaterThan(0);
  });

  test('fails if waiver is expired', () => {
    const modifiedGql = `
      type Query {
        node(id: ID!): NodePayload
      }
    `;
    const waivers = [
      {
        id: 'WAIVER-EXPIRED',
        protocol: 'graphql' as const,
        path: 'Query.nodes',
        changeType: 'REMOVAL',
        reason: 'Expired waiver test',
        author: '@test',
        expiresAt: '2020-01-01',
        ticket: 'canopy-1dk.10',
      },
    ];
    const result = checkApiCompatibility({
      overrideGql: modifiedGql,
      overrideWaivers: waivers,
    });
    expect(result.success).toBe(false);
    expect(result.expiredWaivers.length).toBeGreaterThan(0);
  });

  test('detects stale waiver detection on unused waivers', () => {
    const waivers = [
      {
        id: 'WAIVER-STALE',
        protocol: 'graphql' as const,
        path: 'Query.someOldField',
        changeType: 'REMOVAL',
        reason: 'Stale waiver test',
        author: '@test',
        expiresAt: '2099-01-01',
        ticket: 'canopy-1dk.10',
      },
    ];
    const result = checkApiCompatibility({
      overrideWaivers: waivers,
    });
    expect(result.success).toBe(false);
    expect(result.staleWaivers.length).toBeGreaterThan(0);
  });

  test('detects IPC method removal', () => {
    const modifiedIpc = JSON.stringify({
      openrpc: '1.3.2',
      info: { title: 'Canopy IPC Protocol Specification', version: '0.1.0' },
      methods: [],
      errors: [
        { code: -32_700, message: 'PARSE_ERROR' },
        { code: -32_600, message: 'INVALID_REQUEST' },
        { code: -32_601, message: 'METHOD_NOT_FOUND' },
        { code: -32_602, message: 'INVALID_PARAMS' },
        { code: -32_603, message: 'INTERNAL_ERROR' },
        { code: -32_000, message: 'CANOPY_DOMAIN_ERROR' },
      ],
    });
    const result = checkApiCompatibility({
      overrideIpc: modifiedIpc,
    });
    expect(result.success).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          v.protocol === 'ipc' &&
          v.changeType === 'METHOD_REMOVAL' &&
          v.path === 'canopy.v1.handshake',
      ),
    ).toBe(true);
  });

  test('detects IPC error code removal', () => {
    const modifiedIpc = JSON.stringify({
      openrpc: '1.3.2',
      info: { title: 'Canopy IPC Protocol Specification', version: '0.1.0' },
      methods: [],
      errors: [],
    });
    const result = checkApiCompatibility({
      overrideIpc: modifiedIpc,
    });
    expect(result.success).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          v.protocol === 'ipc' &&
          v.changeType === 'ERROR_CODE_REMOVAL' &&
          v.path === 'Error.-32000',
      ),
    ).toBe(true);
  });

  test('detects IPC parameter removal and tightening', () => {
    const modifiedIpc = JSON.stringify({
      openrpc: '1.3.2',
      info: { title: 'Canopy IPC Protocol Specification', version: '0.1.0' },
      methods: [
        {
          name: 'canopy.v1.handshake',
          params: [
            { name: 'clientVersion', required: true, schema: { type: 'string' } },
            // supportedCapabilities parameter removed
          ],
        },
        {
          name: 'canopy.v1.query.getNodes',
          params: [
            { name: 'type', required: true, schema: { type: 'string' } }, // changed from optional (false) to required (true)
          ],
        },
      ],
      errors: [],
    });
    const result = checkApiCompatibility({
      target: 'ipc',
      overrideIpc: modifiedIpc,
    });
    expect(result.success).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          v.protocol === 'ipc' &&
          v.changeType === 'PARAM_REMOVAL' &&
          v.path === 'canopy.v1.handshake.supportedCapabilities',
      ),
    ).toBe(true);
    expect(
      result.violations.some(
        (v) =>
          v.protocol === 'ipc' &&
          v.changeType === 'PARAM_TIGHTENING' &&
          v.path === 'canopy.v1.query.getNodes.type',
      ),
    ).toBe(true);
  });

  test('detects IPC result property removal', () => {
    const modifiedIpc = JSON.stringify({
      openrpc: '1.3.2',
      info: { title: 'Canopy IPC Protocol Specification', version: '0.1.0' },
      methods: [
        {
          name: 'canopy.v1.handshake',
          params: [
            { name: 'clientVersion', required: true, schema: { type: 'string' } },
            { name: 'supportedCapabilities', required: true, schema: { type: 'array' } },
          ],
          result: {
            name: 'result',
            schema: {
              type: 'object',
              properties: {
                apiVersion: { type: 'string' },
                // serverVersion removed from result schema
              },
            },
          },
        },
      ],
      errors: [],
    });
    const result = checkApiCompatibility({
      target: 'ipc',
      overrideIpc: modifiedIpc,
    });
    expect(result.success).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          v.protocol === 'ipc' &&
          v.changeType === 'RESULT_PROPERTY_REMOVAL' &&
          v.path === 'canopy.v1.handshake.result.serverVersion',
      ),
    ).toBe(true);
  });

  test('accepts approved IPC breaking change with valid waiver', () => {
    const modifiedIpc = JSON.stringify({
      openrpc: '1.3.2',
      info: { title: 'Canopy IPC Protocol Specification', version: '0.1.0' },
      methods: [],
      errors: [
        { code: -32_700, message: 'PARSE_ERROR' },
        { code: -32_600, message: 'INVALID_REQUEST' },
        { code: -32_601, message: 'METHOD_NOT_FOUND' },
        { code: -32_602, message: 'INVALID_PARAMS' },
        { code: -32_603, message: 'INTERNAL_ERROR' },
        { code: -32_000, message: 'CANOPY_DOMAIN_ERROR' },
      ],
    });
    const waivers = [
      {
        id: 'WAIVER-IPC-001',
        protocol: 'ipc' as const,
        path: 'canopy.v1.handshake',
        changeType: 'METHOD_REMOVAL',
        reason: 'Testing IPC method removal waiver',
        author: '@test',
        expiresAt: '2099-01-01',
        ticket: 'canopy-pf0.4',
      },
    ];
    const result = checkApiCompatibility({
      target: 'ipc',
      overrideIpc: modifiedIpc,
      overrideWaivers: waivers,
    });
    expect(
      result.approvedWaivers.some((w) => w.protocol === 'ipc' && w.path === 'canopy.v1.handshake'),
    ).toBe(true);
  });
});
