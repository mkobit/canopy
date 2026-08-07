import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(__dirname, '..');
const eslintBinary = path.join(rootDirectory, 'node_modules', '.bin', 'eslint');

// typescript-eslint's `projectService` builds one type-aware TypeScript program per
// package tsconfig.json it discovers (each workspace's tsconfig.json aliases
// `@canopy/*` imports to sibling packages' `src/index.ts`, so each program pulls in
// the full transitive source of its dependencies, not just their public types).
// A single `eslint .` invocation holds every workspace's program in one process at
// once, which peaks around 3GB RSS on this monorepo -- comfortably past V8's
// default old-space heap on GitHub's macos-14 runners (see canopy-9ec). Splitting
// into one `eslint` process per workspace bounds peak RSS to the single largest
// workspace's program (~1.1GB for apps/web, measured 2026-08) instead of the sum of
// all of them, at the cost of re-parsing shared upstream package sources once per
// workspace instead of once overall.
//
// If this OOMs again in the future, the growth is most likely a single workspace's
// dependency graph (not the monorepo total) -- check which group in the summary
// below is the slow/heavy one before reaching for a NODE_OPTIONS bump.

interface LintGroup {
  readonly label: string;
  readonly targets: readonly string[];
}

const findWorkspaceDirectories = (parentDirectoryName: string): readonly string[] => {
  const parentDirectory = path.join(rootDirectory, parentDirectoryName);
  if (!fs.existsSync(parentDirectory)) {
    return [];
  }
  return fs
    .readdirSync(parentDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parentDirectoryName, entry.name))
    .filter((relativePath) => fs.existsSync(path.join(rootDirectory, relativePath, 'package.json')))
    .toSorted((a, b) => a.localeCompare(b));
};

const workspaceGroups: readonly LintGroup[] = [
  ...findWorkspaceDirectories('packages'),
  ...findWorkspaceDirectories('apps'),
].map((target) => ({ label: target, targets: [target] }));

const groups: readonly LintGroup[] = [
  ...workspaceGroups,
  { label: 'tools + eslint.config.mjs', targets: ['tools', 'eslint.config.mjs'] },
];

interface GroupResult {
  readonly group: LintGroup;
  readonly exitCode: number;
  readonly durationMs: number;
}

const runGroup = (group: LintGroup): GroupResult => {
  const startedAt = performance.now();
  // eslint-disable-next-line no-console -- progress marker for CI logs
  console.log(`\n▶ eslint ${group.targets.join(' ')}`);
  const result = Bun.spawnSync([eslintBinary, ...group.targets, '--cache'], {
    cwd: rootDirectory,
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  const durationMs = performance.now() - startedAt;
  return { group, exitCode: result.exitCode ?? 1, durationMs };
};

const results: readonly GroupResult[] = groups.map(runGroup);

// eslint-disable-next-line no-console -- summary report
console.log('\nLint summary:');
// eslint-disable-next-line functional/no-loop-statements -- printing a summary line per group requires iteration
for (const { group, exitCode, durationMs } of results) {
  const status = exitCode === 0 ? 'ok' : 'FAILED';
  // eslint-disable-next-line no-console -- summary report
  console.log(`  ${status.padEnd(6)} ${group.label} (${(durationMs / 1000).toFixed(1)}s)`);
}

const failed = results.filter((result) => result.exitCode !== 0);
if (failed.length > 0) {
  process.exit(1);
}
