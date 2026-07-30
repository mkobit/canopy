/* eslint-disable no-console, import/extensions -- CLI script */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uniqueChangeNamesFromPaths, validateOpenspecChange } from './lib/openspec-change.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(__dirname, '..');

function getStagedFiles(): readonly string[] {
  const result = Bun.spawnSync(['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    cwd: rootDirectory,
  });
  return result.stdout
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0);
}

async function main(): Promise<void> {
  const changeNames = uniqueChangeNamesFromPaths(getStagedFiles());

  if (changeNames.length === 0) {
    process.exit(0);
  }

  const results = changeNames.map((name) => validateOpenspecChange(name, rootDirectory));
  const failures = results.filter((result) => !result.passed);

  if (failures.length > 0) {
    console.error(
      failures
        .map(
          (failure) => `✗ openspec change "${failure.name}" failed validation:\n${failure.output}`,
        )
        .join('\n\n'),
    );
    console.error(
      `\nFix the change(s) above before committing, or run 'bunx openspec validate <name>' for details.`,
    );
    process.exit(1);
  }

  console.log(`✅ OpenSpec validation passed for staged change(s): ${changeNames.join(', ')}`);
}

main().catch((error: unknown): undefined => {
  console.error('check-openspec-changes: unexpected error', error);
  process.exit(1);
});
