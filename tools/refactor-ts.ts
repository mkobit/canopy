/* eslint-disable no-console, import/extensions, functional/no-loop-statements, unicorn/prefer-hoisting-branch-code, unicorn/no-useless-else -- CLI script */
import { parseArgs } from 'node:util';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTsRefactoring } from './lib/ts-refactoring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const { values } = parseArgs({
  options: {
    fix: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
  strict: false,
});

const isFixMode = Boolean(values.fix);

console.log(
  `🔍 Running TypeScript refactoring analysis (${isFixMode ? 'fix mode' : 'check mode'})...\n`,
);

const report = runTsRefactoring({
  fix: isFixMode,
  rootDir: ROOT_DIR,
});

if (report.duplicateTypeGroups.length > 0) {
  console.log(`⚠️  Found ${report.duplicateTypeGroups.length} duplicate type definition group(s):`);
  for (const group of report.duplicateTypeGroups) {
    console.log(`  - Type '${group.name}' duplicated across ${group.occurrences.length} files:`);
    for (const occ of group.occurrences) {
      const relativePath = path.relative(ROOT_DIR, occ.filePath);
      console.log(`      ${relativePath}:${occ.line}`);
    }
  }
  console.log('');
}

if (report.unindexedImports.length > 0) {
  console.log(`⚠️  Found ${report.unindexedImports.length} unindexed package subpath import(s):`);
  for (const imp of report.unindexedImports) {
    const relativePath = path.relative(ROOT_DIR, imp.filePath);
    console.log(
      `  - ${relativePath}:${imp.line} '${imp.specifier}' -> '${imp.suggestedSpecifier}'`,
    );
  }
  console.log('');
}

if (isFixMode) {
  console.log(`✅ Refactored and updated ${report.fixedFilesCount} file(s).`);
  process.exit(0);
} else {
  const totalIssues = report.duplicateTypeGroups.length + report.unindexedImports.length;
  if (totalIssues > 0) {
    console.error(
      `❌ Found ${totalIssues} refactoring issue(s). Run 'bun run refactor:fix' to resolve unindexed imports.`,
    );
    process.exit(1);
  }
  console.log('✅ No duplicate type declarations or unindexed subpath imports found.');
  process.exit(0);
}
