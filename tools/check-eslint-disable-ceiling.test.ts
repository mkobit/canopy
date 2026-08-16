import { describe, expect, test } from 'bun:test';
import { countDirectives, isExcludedPath } from './check-eslint-disable-ceiling.js';

// Pins the counter's behavior on a fixture so a regex or scope change is caught
// rather than silently shifting the committed baseline.
const FIXTURE = [
  '// eslint-disable-next-line functional/no-let -- counts (line-start //)',
  '  // eslint-disable-next-line foo -- counts (indented //)',
  '/* eslint-disable bar */ // counts (line-start block)',
  '   /* eslint-disable-next-line baz */ // counts (indented block)',
  "const s = 'eslint-disable inside a string does not count';",
  'doThing(); // eslint-disable-line qux -- trailing, NOT anchored, does not count',
  '// eslint-enable foo -- enable is not a disable, does not count',
  '// a normal comment',
].join('\n');

describe('check-eslint-disable-ceiling counter', () => {
  test('countDirectives matches only comment-anchored eslint-disable directives', () => {
    expect(countDirectives(FIXTURE)).toBe(4);
  });

  test('countDirectives returns 0 for content without directives', () => {
    expect(countDirectives('const x = 1;\n// plain comment\n')).toBe(0);
  });

  test('isExcludedPath excludes eslint-ignored paths', () => {
    expect(isExcludedPath('some/dist/index.ts')).toBe(true);
    expect(isExcludedPath('apps/web/src/plugin/transpiled/plugin.ts')).toBe(true);
    expect(isExcludedPath('packages/graph/dist/index.d.ts')).toBe(true);
    expect(isExcludedPath('apps/web/src/plugin/markdown/guest.ts')).toBe(true);
    expect(isExcludedPath('apps/web/scripts/package-plugin.ts')).toBe(true);
    expect(isExcludedPath('packages/graph/scripts/bench-index-maintenance.ts')).toBe(true);
  });

  test('isExcludedPath keeps governed host source', () => {
    expect(isExcludedPath('packages/graph/src/indexes.ts')).toBe(false);
    expect(isExcludedPath('apps/web/src/plugin/markdown/resolver.ts')).toBe(false);
    expect(isExcludedPath('tools/check-eslint-disable-ceiling.ts')).toBe(false);
  });
});
