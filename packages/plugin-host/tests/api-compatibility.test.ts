import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkApiCompatibility } from '../../../tools/lib/api-compatibility-checker';
import { type TypeSpecServiceIr } from '../../../tools/lib/typespec-compiler';
import { CANOPY_WIT_SPECIFICATION } from '../src';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baselineJsonPath = path.resolve(__dirname, '../schema-baselines/canopy-v0-typespec.json');

const loadBaselineTypeSpecIr = (): TypeSpecServiceIr =>
  JSON.parse(fs.readFileSync(baselineJsonPath, 'utf8')) as TypeSpecServiceIr;

describe('API compatibility checker (TypeSpec canopy.v0 & WIT)', () => {
  test('passes verification against unchanged WIT and TypeSpec baselines', () => {
    const result = checkApiCompatibility({
      target: 'all',
      currentWit: CANOPY_WIT_SPECIFICATION,
      checkCodegenDrift: true,
    });

    expect(result.success).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test('detects WIT function removal and signature changes', () => {
    const modifiedWit = CANOPY_WIT_SPECIFICATION.replace(
      'query-nodes: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;',
      'query-nodes: func(token: capability-token) -> result<string, adapter-error>;',
    ).replace(
      '  query-edges: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;\n',
      '',
    );

    const result = checkApiCompatibility({
      target: 'wit',
      overrideWit: modifiedWit,
    });

    expect(result.success).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.protocol === 'wit' && violation.changeType === 'FUNCTION_REMOVAL',
      ),
    ).toBe(true);
    expect(
      result.violations.some(
        (violation) => violation.protocol === 'wit' && violation.changeType === 'SIGNATURE_CHANGE',
      ),
    ).toBe(true);
  });

  test('accepts approved WIT breaking change with valid waiver', () => {
    const modifiedWit = CANOPY_WIT_SPECIFICATION.replace(
      '  query-edges: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;\n',
      '',
    );
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

  test('fails if WIT waiver is expired', () => {
    const modifiedWit = CANOPY_WIT_SPECIFICATION.replace(
      '  query-edges: func(token: capability-token, payload-json: string) -> result<string, adapter-error>;\n',
      '',
    );
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

  test('detects TypeSpec closed enum variant addition and accepts valid TypeSpec waiver', () => {
    const baseline = loadBaselineTypeSpecIr();
    const modified: TypeSpecServiceIr = {
      ...baseline,
      enums: baseline.enums.map((entry) =>
        entry.name === 'CanopyV0ActorKind'
          ? {
              ...entry,
              members: [...entry.members, { name: 'service', value: 'service' }],
            }
          : entry,
      ),
    };

    const unwaived = checkApiCompatibility({
      target: 'typespec',
      baselineTypeSpecIr: baseline,
      overrideTypeSpecIr: modified,
    });
    expect(unwaived.success).toBe(false);
    expect(unwaived.violations).toContainEqual(
      expect.objectContaining({
        protocol: 'typespec',
        changeType: 'ENUM_VARIANT_ADDED',
        path: 'CanopyV0ActorKind.service',
      }),
    );

    const waived = checkApiCompatibility({
      target: 'typespec',
      baselineTypeSpecIr: baseline,
      overrideTypeSpecIr: modified,
      overrideWaivers: [
        {
          id: 'WAIVER-TSP-001',
          protocol: 'typespec',
          path: 'CanopyV0ActorKind.service',
          changeType: 'ENUM_VARIANT_ADDED',
          reason: 'Testing TypeSpec forward-compat waiver',
          author: '@test',
          expiresAt: '2099-01-01',
          ticket: 'canopy-anir.2.2',
        },
      ],
    });
    expect(waived.success).toBe(true);
    expect(waived.approvedWaivers).toHaveLength(1);
  });
});
