import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkApiCompatibility, checkTypeSpec } from './lib/api-compatibility-checker';
import {
  generateAllCodegenArtifacts,
  getDefaultTypeSpecSourcePath,
  loadAndParseTypeSpecFromDisk,
  parseTypeSpecService,
  type TypeSpecServiceIr,
} from './lib/typespec-compiler';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(__dirname, '..');

const loadCanonicalIr = (): TypeSpecServiceIr => {
  const result = loadAndParseTypeSpecFromDisk(getDefaultTypeSpecSourcePath(rootDirectory));
  if (!result.ok) {
    throw new Error(`Expected canonical main.tsp to parse: ${result.error}`);
  }
  return result.value;
};

describe('TypeSpec canopy.v0 compiler and codegen', () => {
  test('parses all 6 namespaces, 25 operations, unified WIT interfaces, and 4 worlds from main.tsp', () => {
    const ir = loadCanonicalIr();

    expect(ir.serviceTitle).toBe('Canopy v0 API');
    expect(ir.version).toBe('0.0.0');
    expect(ir.namespaces.map((ns) => ns.name)).toEqual([
      'Graphs',
      'Transactions',
      'Queries',
      'Views',
      'Bundles',
      'Streams',
    ]);

    const totalOperations = ir.namespaces.reduce((sum, ns) => sum + ns.operations.length, 0);
    expect(totalOperations).toBe(25);
    expect(ir.witPackage).toBe('canopy:graph');
    expect(ir.witInterfaces.map((iface) => iface.name)).toEqual([
      'graph-types',
      'host-queries',
      'host-mutations',
      'host-events',
      'host-filesystem',
      'host-http',
      'host-secrets',
      'host-clock',
      'draft-session',
      'plugin-manifest',
      'plugin-lifecycle',
      'content-rendering',
      'wizard-execution',
    ]);
    expect(ir.witWorlds.map((world) => world.name)).toEqual([
      'graph-plugin',
      'server-extension-plugin',
      'wizard-plugin',
      'render-plugin',
    ]);
  });

  test('emits deterministic artifacts matching committed files on disk with zero drift', () => {
    const ir = loadCanonicalIr();
    const first = generateAllCodegenArtifacts(ir);
    const second = generateAllCodegenArtifacts(ir);
    expect(first).toEqual(second);

    expect(
      fs.readFileSync(
        path.join(rootDirectory, 'packages/graph-access/src/canopy-v0-contract.ts'),
        'utf8',
      ),
    ).toBe(first.contractTs);
    expect(
      fs.readFileSync(
        path.join(rootDirectory, 'packages/plugin-host/src/wasm/wit-spec.ts'),
        'utf8',
      ),
    ).toBe(first.witSpecTs);
    expect(
      fs.readFileSync(
        path.join(rootDirectory, 'packages/plugin-host/schema-baselines/plugin.wit'),
        'utf8',
      ),
    ).toBe(first.witBaselineText);
    expect(
      fs.readFileSync(
        path.join(rootDirectory, 'packages/plugin-host/schema-baselines/canopy-v0-typespec.json'),
        'utf8',
      ),
    ).toBe(first.typespecBaselineJson);
  });

  test('detects backward and forward wire-compatibility violations on TypeSpec contracts', () => {
    const baselineText = `
      @service(#{ title: "Test API", version: "0.0.0" })
      namespace Canopy.V0 {
        enum ClosedState {
          open: "open",
          closed: "closed",
        }

        @extensible
        enum OpenKind {
          user: "user",
        }

        @route("/v0/items")
        namespace Items {
          model ItemRequest {
            id: string;
            note?: string;
            @deprecated("Use note instead")
            legacyNote?: string;
          }

          model ItemResponse {
            id: string;
            state: ClosedState;
            kind: OpenKind;
          }

          @get
          op getItem(request: ItemRequest): ItemResponse;

          @deprecated("Replaced by getItem")
          @post
          @route("/legacy")
          op legacyOp(request: ItemRequest): ItemResponse;
        }
      }
    `;
    const baselineParsed = parseTypeSpecService(baselineText);
    expect(baselineParsed.ok).toBe(true);
    if (!baselineParsed.ok) return;

    const breakingLiveText = `
      @service(#{ title: "Test API", version: "0.0.0" })
      namespace Canopy.V0 {
        enum ClosedState {
          open: "open",
          pending: "pending",
        }

        @extensible
        enum OpenKind {
          user: "user",
          agent: "agent",
        }

        @route("/v0/items")
        namespace Items {
          model ItemRequest {
            note: string;
            addedRequired: string;
          }

          model ItemResponse {
            id?: int32;
            state: ClosedState;
            kind: OpenKind;
          }

          @post
          @route("/renamed")
          op getItem(request: ItemRequest): ItemResponse;
        }
      }
    `;
    const liveParsed = parseTypeSpecService(breakingLiveText);
    expect(liveParsed.ok).toBe(true);
    if (!liveParsed.ok) return;

    const violations = checkTypeSpec(liveParsed.value, baselineParsed.value);
    const types = new Set(violations.map((violation) => violation.changeType));

    expect(types.has('UNDEPRECATED_REMOVAL')).toBe(true);
    expect(types.has('FIELD_REMOVAL')).toBe(true);
    expect(types.has('OPERATION_REMOVAL')).toBe(true);
    expect(types.has('ROUTE_CHANGE')).toBe(true);
    expect(types.has('OPTIONAL_TO_REQUIRED')).toBe(true);
    expect(types.has('REQUIRED_TO_OPTIONAL')).toBe(true);
    expect(types.has('FIELD_TYPE_CHANGE')).toBe(true);
    expect(types.has('ENUM_VARIANT_REMOVAL')).toBe(true);
    expect(types.has('ENUM_VARIANT_ADDED')).toBe(true);
    expect(violations.some((violation) => violation.path.startsWith('OpenKind.'))).toBe(false);

    // Undeprecated removals must remain rejected even if a waiver is supplied.
    const waivedUndeprecated = checkApiCompatibility({
      target: 'typespec',
      baselineTypeSpecIr: baselineParsed.value,
      overrideTypeSpecIr: liveParsed.value,
      overrideWaivers: [
        {
          id: 'W-UNDEP',
          protocol: 'typespec',
          path: 'ItemRequest.id',
          changeType: 'UNDEPRECATED_REMOVAL',
          reason: 'Should never waive undeprecated removal',
          author: '@test',
          expiresAt: '2099-01-01',
          ticket: 'canopy-anir.2.2',
        },
      ],
    });
    expect(waivedUndeprecated.success).toBe(false);
    expect(
      waivedUndeprecated.violations.some(
        (v) => v.path === 'ItemRequest.id' && v.changeType === 'UNDEPRECATED_REMOVAL',
      ),
    ).toBe(true);
  });

  test('detects NAMESPACE_REMOVAL and MODEL_REMOVAL when namespaces or models disappear', () => {
    const ir = loadCanonicalIr();
    const strippedIr: TypeSpecServiceIr = {
      ...ir,
      namespaces: ir.namespaces.filter((ns) => ns.name !== 'Streams'),
      models: ir.models.filter((model) => model.name !== 'CanopyV0StreamEnvelope'),
    };
    const result = checkApiCompatibility({
      target: 'typespec',
      baselineTypeSpecIr: ir,
      overrideTypeSpecIr: strippedIr,
    });
    expect(result.success).toBe(false);
    expect(result.violations.some((v) => v.changeType === 'NAMESPACE_REMOVAL')).toBe(true);
    expect(result.violations.some((v) => v.changeType === 'MODEL_REMOVAL')).toBe(true);
  });
});
