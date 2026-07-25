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
    const modifiedProto = `
      message NodeResponse {
        bool success = 1;
        string id = 2;
      }
    `;
    const result = checkApiCompatibility({
      overrideProto: modifiedProto,
    });
    expect(result.success).toBe(false);
    expect(
      result.violations.some((v) => v.protocol === 'connect' && v.changeType === 'FIELD_REMOVAL'),
    ).toBe(true);
  });

  test('detects Protobuf tag shift', () => {
    const modifiedProto = `
      message NodeResponse {
        bool success = 2;
        string id = 1;
      }
    `;
    const result = checkApiCompatibility({
      overrideProto: modifiedProto,
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
});
