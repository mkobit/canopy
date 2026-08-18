import { describe, expect, test } from 'bun:test';
import {
  checkWorkflowVersionConsistency,
  classifyPin,
  findSetupBunVersionPins,
  matchesGeneratedArtifact,
  parseWorkflowEnvironment,
  readMiseBunVersion,
  resolvePinValue,
} from './check-ci-tooling.js';

// Pins the workflow-YAML parsing and comparison logic against small fixtures
// so a regex/scope change is caught rather than silently shifting what the
// guard reports on the real repo. Fixtures are inline text, not the repo's
// actual workflow files, so this stays correct regardless of drift there.

const MISE_ACTION_ONLY = [
  'jobs:',
  '  ci:',
  '    steps:',
  '      - name: Setup mise',
  '        uses: jdx/mise-action@abc123',
  '        with:',
  '          version: v2026.5.1',
].join('\n');

const LITERAL_PIN = [
  'jobs:',
  '  validate:',
  '    steps:',
  '      - name: Setup Bun',
  '        uses: oven-sh/setup-bun@v2',
  '        with:',
  "          bun-version: '1.3.14'",
  '      - name: Install',
  '        run: bun install',
].join('\n');

const ENV_INDIRECTED_PIN = [
  'env:',
  "  BUN_VERSION: '1.3.12'",
  '',
  'jobs:',
  '  validate:',
  '    steps:',
  '      - name: Setup Bun',
  '        uses: oven-sh/setup-bun@v2',
  '        with:',
  '          bun-version: ${{ env.BUN_VERSION }}',
].join('\n');

const UNRESOLVABLE_PIN = [
  'jobs:',
  '  validate:',
  '    steps:',
  '      - name: Setup Bun',
  '        uses: oven-sh/setup-bun@v2',
  '        with:',
  '          bun-version: ${{ steps.pick.outputs.version }}',
].join('\n');

const FLOATING_PIN = [
  'jobs:',
  '  validate:',
  '    steps:',
  '      - name: Setup Bun',
  '        uses: oven-sh/setup-bun@v2',
  '        with:',
  '          bun-version: latest',
].join('\n');

describe('readMiseBunVersion', () => {
  test('extracts the pinned bun version from mise.toml', () => {
    expect(readMiseBunVersion('[tools]\nbun = "1.3.14"\n')).toBe('1.3.14');
  });

  test('returns undefined when no bun line exists', () => {
    expect(readMiseBunVersion('[tools]\nnode = "22"\n')).toBeUndefined();
  });
});

describe('findSetupBunVersionPins', () => {
  test('finds nothing for a mise-action-only workflow', () => {
    expect(findSetupBunVersionPins(MISE_ACTION_ONLY)).toEqual([]);
  });

  test('finds a literal bun-version pin scoped to its own step', () => {
    expect(findSetupBunVersionPins(LITERAL_PIN)).toEqual(["'1.3.14'"]);
  });

  test('finds an env-indirected bun-version pin', () => {
    expect(findSetupBunVersionPins(ENV_INDIRECTED_PIN)).toEqual(['${{ env.BUN_VERSION }}']);
  });
});

describe('parseWorkflowEnvironment', () => {
  test('parses the top-level env block', () => {
    const environment = parseWorkflowEnvironment(ENV_INDIRECTED_PIN);
    expect(environment.get('BUN_VERSION')).toBe('1.3.12');
  });

  test('returns an empty map when there is no env block', () => {
    expect(parseWorkflowEnvironment(LITERAL_PIN).size).toBe(0);
  });
});

describe('resolvePinValue', () => {
  test('strips quotes from a literal', () => {
    expect(resolvePinValue("'1.3.14'", new Map())).toBe('1.3.14');
  });

  test('resolves an env reference against the workflow env map', () => {
    const environment = new Map([['BUN_VERSION', '1.3.12']]);
    expect(resolvePinValue('${{ env.BUN_VERSION }}', environment)).toBe('1.3.12');
  });

  test('returns undefined for an env reference missing from the map', () => {
    expect(resolvePinValue('${{ env.MISSING }}', new Map())).toBeUndefined();
  });

  test('returns undefined for an unresolvable expression', () => {
    expect(resolvePinValue('${{ steps.pick.outputs.version }}', new Map())).toBeUndefined();
  });
});

describe('classifyPin', () => {
  test('compliant when the resolved value matches mise.toml', () => {
    expect(classifyPin('1.3.14', '1.3.14')).toBe('compliant');
  });

  test('drift when the resolved value differs from mise.toml', () => {
    expect(classifyPin('1.3.12', '1.3.14')).toBe('drift');
  });

  test('floating for latest/canary/nightly, not compared', () => {
    expect(classifyPin('latest', '1.3.14')).toBe('floating');
    expect(classifyPin('canary', '1.3.14')).toBe('floating');
  });

  test('unresolved when the value is undefined or non-numeric', () => {
    expect(classifyPin(undefined, '1.3.14')).toBe('unresolved');
    expect(classifyPin('stable', '1.3.14')).toBe('unresolved');
  });
});

describe('checkWorkflowVersionConsistency', () => {
  test('passes a mise-action-only workflow', () => {
    expect(checkWorkflowVersionConsistency('ci.yml', MISE_ACTION_ONLY, '1.3.14')).toEqual([]);
  });

  test('passes a literal pin that matches mise.toml', () => {
    expect(checkWorkflowVersionConsistency('ci.yml', LITERAL_PIN, '1.3.14')).toEqual([]);
  });

  test('fails an env-indirected pin that drifts from mise.toml -- the live openspec.yml bug', () => {
    const violations = checkWorkflowVersionConsistency(
      'openspec.yml',
      ENV_INDIRECTED_PIN,
      '1.3.14',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('openspec.yml');
    expect(violations[0]?.message).toContain('1.3.12');
    expect(violations[0]?.message).toContain('1.3.14');
  });

  test('fails closed on an unresolvable pin rather than silently passing', () => {
    const violations = checkWorkflowVersionConsistency('ci.yml', UNRESOLVABLE_PIN, '1.3.14');
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('could not be resolved');
  });

  test('passes a floating pin without comparing it', () => {
    expect(checkWorkflowVersionConsistency('ci.yml', FLOATING_PIN, '1.3.14')).toEqual([]);
  });
});

describe('matchesGeneratedArtifact', () => {
  test('matches each generated-artifact glob', () => {
    expect(matchesGeneratedArtifact('apps/web/src/plugin/markdown/guest.js')).toBeDefined();
    expect(matchesGeneratedArtifact('apps/web/src/plugin/markdown/plugin.wasm')).toBeDefined();
    expect(
      matchesGeneratedArtifact('apps/web/src/plugin/markdown/transpiled/plugin.js'),
    ).toBeDefined();
    expect(matchesGeneratedArtifact('apps/web/src/plugin/mock/plugin-node.json')).toBeDefined();
    expect(matchesGeneratedArtifact('apps/web/src/plugin/types/plugin.d.ts')).toBeDefined();
  });

  test('does not match hand-authored source', () => {
    expect(matchesGeneratedArtifact('apps/web/src/plugin/markdown/resolver.ts')).toBeUndefined();
    expect(matchesGeneratedArtifact('tools/check-ci-tooling.ts')).toBeUndefined();
  });
});
