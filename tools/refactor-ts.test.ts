import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  analyzeDuplicateTypesInFile,
  analyzeUnindexedImportsInFile,
  rewriteUnindexedImportsInContent,
  runTsRefactoring,
} from './lib/ts-refactoring.js';

describe('TypeScript Refactoring Tools', () => {
  test('analyzeDuplicateTypesInFile detects interface and typeAlias declarations', () => {
    const code = `
      export interface UserProfile {
        readonly id: string;
        readonly name: string;
      }

      export type UserRole = 'admin' | 'guest';
    `;

    const results = analyzeDuplicateTypesInFile('test.ts', code);

    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('UserProfile');
    expect(results[0]?.kind).toBe('interface');
    expect(results[1]?.name).toBe('UserRole');
    expect(results[1]?.kind).toBe('typeAlias');
  });

  test('analyzeUnindexedImportsInFile identifies cross-package subpath imports', () => {
    const code = `
      import { GraphSession } from '@canopy/graph/src/session.js';
      import { UserSetting } from '@canopy/settings';
      import { LocalHelper } from './helper.js';
    `;

    const results = analyzeUnindexedImportsInFile('app.ts', code);

    expect(results.length).toBe(1);
    expect(results[0]?.specifier).toBe('@canopy/graph/src/session.js');
    expect(results[0]?.suggestedSpecifier).toBe('@canopy/graph');
  });

  test('rewriteUnindexedImportsInContent replaces subpath imports with canonical package exports', () => {
    const code = `import { GraphSession } from '@canopy/graph/src/session.js';\nimport { query } from '@canopy/queries/dist/executor.js';`;

    const { updatedContent, changed } = rewriteUnindexedImportsInContent(code);

    expect(changed).toBe(true);
    expect(updatedContent).toContain("from '@canopy/graph'");
    expect(updatedContent).toContain("from '@canopy/queries'");
  });

  test('runTsRefactoring scans directory structure and performs dry-run / fix', () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-refactor-test-'));

    try {
      const package1Directory = path.join(temporaryDirectory, 'packages', 'pkg1', 'src');
      const package2Directory = path.join(temporaryDirectory, 'packages', 'pkg2', 'src');
      fs.mkdirSync(package1Directory, { recursive: true });
      fs.mkdirSync(package2Directory, { recursive: true });

      const file1 = path.join(package1Directory, 'index.ts');
      const file2 = path.join(package2Directory, 'index.ts');

      const dupType = 'export interface SharedConfig { readonly key: string; }';
      fs.writeFileSync(file1, `${dupType}\nimport { x } from '@canopy/pkg1/src/index.js';`, 'utf8');
      fs.writeFileSync(file2, dupType, 'utf8');

      // Dry run scan
      const dryReport = runTsRefactoring({ fix: false, rootDir: temporaryDirectory });
      expect(dryReport.duplicateTypeGroups.length).toBe(1);
      expect(dryReport.duplicateTypeGroups[0]?.name).toBe('SharedConfig');
      expect(dryReport.unindexedImports.length).toBe(1);

      // Fix run
      const fixReport = runTsRefactoring({ fix: true, rootDir: temporaryDirectory });
      expect(fixReport.fixedFilesCount).toBe(1);

      const file1ContentAfterFix = fs.readFileSync(file1, 'utf8');
      expect(file1ContentAfterFix).toContain("from '@canopy/pkg1'");
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
