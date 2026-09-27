import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findForbiddenImportsInSource } from './source-import-boundaries';

const fixtures = path.resolve(__dirname, '../fixtures/source-import-boundaries');
const repoRoot = path.resolve(__dirname, '../..');
const importer = path.join(repoRoot, 'packages/plugin-host/src/fixture.ts');
const boundary = {
  sourceRoot: path.dirname(importer),
  forbiddenPackage: '@canopy/api-adapter',
  forbiddenRoot: path.join(repoRoot, 'packages/api-adapter'),
  aliases: [
    {
      name: '#transport',
      target: path.join(repoRoot, 'packages/api-adapter/src/index.ts'),
    },
  ],
} as const;

const checkFixture = (name: string) =>
  findForbiddenImportsInSource(
    importer,
    readFileSync(path.join(fixtures, `${name}.txt`), 'utf8'),
    boundary,
  );

describe('source import boundaries', () => {
  test('allows imports outside the forbidden package', () => {
    expect(checkFixture('allowed')).toEqual([]);
  });

  test.each(['normal', 'type-only', 'deep', 'dynamic', 'relative', 'alias'])(
    'rejects %s imports',
    (name) => {
      expect(checkFixture(name)).toHaveLength(1);
    },
  );
});
