import { describe, expect, test } from 'bun:test';
import { checkApiCompatibility } from '../../../tools/lib/api-compatibility-checker';
import { CANOPY_WIT_SPECIFICATION } from '../src';

describe('WIT compatibility checker', () => {
  test('passes verification against the unchanged baseline', () => {
    const result = checkApiCompatibility({
      target: 'wit',
      currentWit: CANOPY_WIT_SPECIFICATION,
    });

    expect(result.success).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test('detects function removal and signature changes', () => {
    const modifiedWit = `
      interface host-queries {
        use graph-types.{capability-token, adapter-error};
        query-nodes: func(token: capability-token) -> result<string, adapter-error>;
      }
    `;
    const result = checkApiCompatibility({
      target: 'wit',
      overrideWit: modifiedWit,
    });

    expect(result.success).toBe(false);
    expect(
      result.violations.some(
        (violation) =>
          violation.protocol === 'wit' &&
          (violation.changeType === 'FUNCTION_REMOVAL' ||
            violation.changeType === 'SIGNATURE_CHANGE'),
      ),
    ).toBe(true);
  });

  test('accepts approved breaking change with valid waiver', () => {
    const modifiedWit = `
      interface host-queries {
        use graph-types.{capability-token, adapter-error};
        query-nodes: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
      }
    `;
    const waivers = [
      {
        id: 'WAIVER-WIT-001',
        protocol: 'wit' as const,
        path: 'host-queries.query-edges',
        changeType: 'FUNCTION_REMOVAL',
        reason: 'Testing WIT waiver approval',
        author: '@test',
        expiresAt: '2099-01-01',
        ticket: 'canopy-1dk.10',
      },
    ];
    const result = checkApiCompatibility({
      target: 'wit',
      overrideWit: modifiedWit,
      overrideWaivers: waivers,
    });

    expect(result.success).toBe(true);
    expect(result.approvedWaivers.length).toBeGreaterThan(0);
  });

  test('fails if waiver is expired', () => {
    const modifiedWit = `
      interface host-queries {
        use graph-types.{capability-token, adapter-error};
        query-nodes: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;
      }
    `;
    const waivers = [
      {
        id: 'WAIVER-WIT-EXPIRED',
        protocol: 'wit' as const,
        path: 'host-queries.query-edges',
        changeType: 'FUNCTION_REMOVAL',
        reason: 'Expired WIT waiver test',
        author: '@test',
        expiresAt: '2020-01-01',
        ticket: 'canopy-1dk.10',
      },
    ];
    const result = checkApiCompatibility({
      target: 'wit',
      overrideWit: modifiedWit,
      overrideWaivers: waivers,
    });

    expect(result.success).toBe(false);
    expect(result.expiredWaivers.length).toBeGreaterThan(0);
  });

  test('detects stale waivers that match no violations', () => {
    const waivers = [
      {
        id: 'WAIVER-WIT-STALE',
        protocol: 'wit' as const,
        path: 'host-queries.non-existent',
        changeType: 'FUNCTION_REMOVAL',
        reason: 'Stale WIT waiver test',
        author: '@test',
        expiresAt: '2099-01-01',
        ticket: 'canopy-1dk.10',
      },
    ];
    const result = checkApiCompatibility({
      target: 'wit',
      currentWit: CANOPY_WIT_SPECIFICATION,
      overrideWaivers: waivers,
    });

    expect(result.success).toBe(false);
    expect(result.staleWaivers.length).toBeGreaterThan(0);
  });
});
