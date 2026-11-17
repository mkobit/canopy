import { describe, expect, test } from 'bun:test';
import { checkApiCompatibility } from '../../../tools/lib/api-compatibility-checker';
import { JSON_RPC_IPC_SPECIFICATION } from '../src';

describe('API Compatibility Checker Engine', () => {
  test('passes clean verification against unchanged baselines', () => {
    const results = [
      checkApiCompatibility({ target: 'ipc', currentIpc: JSON_RPC_IPC_SPECIFICATION }),
    ];
    expect(results.every((result) => result.success)).toBe(true);
    expect(results.flatMap((result) => result.violations)).toEqual([]);
  });

  test('accepts approved breaking change with valid waiver', () => {
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
        id: 'WAIVER-001',
        protocol: 'ipc' as const,
        path: 'canopy.v1.handshake',
        changeType: 'METHOD_REMOVAL',
        reason: 'Testing waiver approval',
        author: '@test',
        expiresAt: '2099-01-01',
        ticket: 'canopy-1dk.10',
      },
    ];
    const result = checkApiCompatibility({
      target: 'ipc',
      overrideIpc: modifiedIpc,
      overrideWaivers: waivers,
    });
    expect(result.approvedWaivers.length).toBeGreaterThan(0);
  });

  test('fails if waiver is expired', () => {
    const modifiedIpc = JSON.stringify({
      openrpc: '1.3.2',
      info: { title: 'Canopy IPC Protocol Specification', version: '0.1.0' },
      methods: [],
      errors: [],
    });
    const waivers = [
      {
        id: 'WAIVER-EXPIRED',
        protocol: 'ipc' as const,
        path: 'canopy.v1.handshake',
        changeType: 'METHOD_REMOVAL',
        reason: 'Expired waiver test',
        author: '@test',
        expiresAt: '2020-01-01',
        ticket: 'canopy-1dk.10',
      },
    ];
    const result = checkApiCompatibility({
      target: 'ipc',
      overrideIpc: modifiedIpc,
      overrideWaivers: waivers,
    });
    expect(result.success).toBe(false);
    expect(result.expiredWaivers.length).toBeGreaterThan(0);
  });

  test('detects stale waiver detection on unused waivers', () => {
    const waivers = [
      {
        id: 'WAIVER-STALE',
        protocol: 'ipc' as const,
        path: 'canopy.v1.someOldMethod',
        changeType: 'METHOD_REMOVAL',
        reason: 'Stale waiver test',
        author: '@test',
        expiresAt: '2099-01-01',
        ticket: 'canopy-1dk.10',
      },
    ];
    const result = checkApiCompatibility({
      target: 'ipc',
      overrideWaivers: waivers,
      currentIpc: JSON_RPC_IPC_SPECIFICATION,
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
      target: 'ipc',
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
      target: 'ipc',
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
