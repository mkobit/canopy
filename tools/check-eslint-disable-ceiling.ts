import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ratchet on the total number of `eslint-disable` directives across host source.
// The count may only DECREASE from the committed baseline: a new disable fails,
// the ceiling is lowered deliberately by rewrite beads (canopy-v9o.1). See the
// design at openspec/changes/codify-elimination-guards/design.md.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(__dirname, '..');
const baselinePath = path.join(__dirname, 'eslint-disable-baseline.json');

// Anchored to comment-start so prose/string mentions of the token do not count.
// Matches `// eslint-disable*` and `/* eslint-disable*` (next-line, line, block).
const DIRECTIVE_PATTERN = /^\s*(\/\/|\/\*)\s*eslint-disable/;

// Git pathspecs for the host source the ratchet governs. Directory prefixes
// (not `dir/**/*.ts`) because git's `**/` requires an intermediate segment and
// would silently drop top-level files like `tools/verify-versions.ts`; the
// extension filter below narrows to the file types we count.
const SCOPE_PATHSPECS: readonly string[] = ['packages', 'apps', 'tools', 'eslint.config.mjs'];

const SCOPE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mjs'];

function isInScope(relativePath: string): boolean {
  return SCOPE_EXTENSIONS.some((extension) => relativePath.endsWith(extension));
}

// Mirrors the paths in eslint.config.mjs `ignores` that actually contain
// directives today; directives in ignored files are inert (eslint never
// evaluates them) so counting them would gate on dead code. Keep minimal and
// keep each entry's eslint.config.mjs source visible.
const EXCLUSION_PATTERNS: readonly RegExp[] = [
  /(^|\/)node_modules\//, // ignores: 'node_modules'
  /(^|\/)dist\//, // ignores: 'dist', 'packages/*/dist/**/*', 'apps/*/dist/**/*'
  /\/transpiled\//, // ignores: '**/transpiled/**/*'
  /\.d\.ts$/, // ignores: '**/*.d.ts'
  /^apps\/web\/src\/plugin\/markdown\/guest\.ts$/, // ignores: guest.ts (WASM guest source)
  /^apps\/web\/src\/plugin\/mock\//, // ignores: 'apps/web/src/plugin/mock/**/*'
  /^apps\/web\/src\/plugin\/draft-session-shim\.ts$/, // ignores: draft-session-shim.ts
  /^apps\/extension\/scripts\//, // ignores: 'apps/extension/scripts/**/*'
  /^apps\/web\/scripts\//, // ignores: 'apps/web/scripts/**/*'
  /^packages\/graph\/scripts\//, // ignores: 'packages/graph/scripts/**/*'
];

export function isExcludedPath(relativePath: string): boolean {
  return EXCLUSION_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function directiveLines(fileText: string): readonly string[] {
  return fileText.split('\n').filter((line) => DIRECTIVE_PATTERN.test(line));
}

export function countDirectives(fileText: string): number {
  return directiveLines(fileText).length;
}

function listTrackedFiles(root: string): readonly string[] {
  const output = execFileSync('git', ['ls-files', '-z', '--', ...SCOPE_PATHSPECS], {
    cwd: root,
    encoding: 'utf8',
  });
  return output.split('\0').filter((entry) => entry.length > 0);
}

export function countTrackedDirectives(root: string): number {
  return listTrackedFiles(root)
    .filter((relativePath) => isInScope(relativePath) && !isExcludedPath(relativePath))
    .flatMap((relativePath) => directiveLines(readFileSync(path.join(root, relativePath), 'utf8')))
    .length;
}

function readCeiling(): number {
  const raw: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'ceiling' in raw &&
    typeof raw.ceiling === 'number'
  ) {
    return raw.ceiling;
  }
  process.stderr.write(`Invalid baseline at ${baselinePath}: expected { "ceiling": <int> }.\n`);
  process.exit(1);
}

function main(): undefined {
  const count = countTrackedDirectives(rootDirectory);

  if (process.argv.includes('--update')) {
    writeFileSync(baselinePath, `${JSON.stringify({ ceiling: count }, undefined, 2)}\n`, 'utf8');
    process.stdout.write(`Updated eslint-disable ceiling to ${count} in ${baselinePath}.\n`);
    return undefined;
  }

  const ceiling = readCeiling();

  if (count > ceiling) {
    process.stderr.write(
      `❌ eslint-disable ceiling exceeded: ${count} directives > ceiling ${ceiling}.\n` +
        `Eliminate the new directive by rewriting the code (functional style; see AGENTS.md).\n` +
        `The ceiling only ratchets down — raising it in tools/eslint-disable-baseline.json ` +
        `requires an explicit, reviewed one-line diff.\n`,
    );
    process.exit(1);
  }

  if (count < ceiling) {
    process.stdout.write(
      `✅ eslint-disable count ${count} is below ceiling ${ceiling}. Tighten the ratchet: ` +
        `bun tools/check-eslint-disable-ceiling.ts --update\n`,
    );
    return undefined;
  }

  process.stdout.write(`✅ eslint-disable count ${count} matches ceiling ${ceiling}.\n`);
  return undefined;
}

// Only run when invoked directly (`bun tools/…`), not when imported by the test.
if (import.meta.main) {
  main();
}
