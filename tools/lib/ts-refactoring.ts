/* eslint-disable functional/no-loop-statements, functional/immutable-data, functional/no-let, functional/prefer-immutable-types, functional/no-return-void, functional/readonly-type, unicorn/prefer-includes-over-repeated-comparisons, unicorn/no-lonely-if, unicorn/name-replacements, unicorn/prefer-direct-iteration, unicorn/no-array-sort -- AST traversal and refactoring tool */
import ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type DuplicateTypeInfo = Readonly<{
  name: string;
  kind: 'interface' | 'typeAlias';
  filePath: string;
  line: number;
  snippet: string;
}>;

export type DuplicateTypeGroup = Readonly<{
  name: string;
  occurrences: readonly DuplicateTypeInfo[];
}>;

export type UnindexedImportInfo = Readonly<{
  filePath: string;
  line: number;
  specifier: string;
  suggestedSpecifier: string;
}>;

export type RefactorOptions = Readonly<{
  fix?: boolean;
  rootDir?: string;
}>;

export type RefactorReport = Readonly<{
  duplicateTypeGroups: readonly DuplicateTypeGroup[];
  unindexedImports: readonly UnindexedImportInfo[];
  fixedFilesCount: number;
}>;

const CROSS_PACKAGE_SUBPATH_REGEX = /^@canopy\/([a-z0-9-]+)\/(?:src|dist)\/(.+)$/;

export function normalizeStructure(nodeText: string): string {
  return nodeText.replaceAll(/\s+/g, ' ').trim();
}

export function parseSourceFile(filePath: string, content: string): ts.SourceFile {
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

export function analyzeDuplicateTypesInFile(
  filePath: string,
  content: string,
): readonly DuplicateTypeInfo[] {
  const sourceFile = parseSourceFile(filePath, content);
  const results: DuplicateTypeInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      results.push({
        name: node.name.text,
        kind: 'interface',
        filePath,
        line,
        snippet: normalizeStructure(node.getText(sourceFile)),
      });
    } else if (ts.isTypeAliasDeclaration(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      results.push({
        name: node.name.text,
        kind: 'typeAlias',
        filePath,
        line,
        snippet: normalizeStructure(node.getText(sourceFile)),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

export function analyzeUnindexedImportsInFile(
  filePath: string,
  content: string,
): readonly UnindexedImportInfo[] {
  const sourceFile = parseSourceFile(filePath, content);
  const results: UnindexedImportInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const match = specifier.match(CROSS_PACKAGE_SUBPATH_REGEX);
      if (match) {
        const pkgName = match[1];
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        results.push({
          filePath,
          line,
          specifier,
          suggestedSpecifier: `@canopy/${pkgName}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

export function rewriteUnindexedImportsInContent(content: string): {
  readonly updatedContent: string;
  readonly changed: boolean;
} {
  const sourceFile = parseSourceFile('temp.tsx', content);
  const replacements: { readonly start: number; readonly end: number; readonly newText: string }[] =
    [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const match = specifier.match(CROSS_PACKAGE_SUBPATH_REGEX);
      if (match) {
        const pkgName = match[1];
        const suggested = `@canopy/${pkgName}`;
        replacements.push({
          start: node.moduleSpecifier.getStart(sourceFile),
          end: node.moduleSpecifier.getEnd(),
          newText: `'${suggested}'`,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (replacements.length === 0) {
    return { updatedContent: content, changed: false };
  }

  // Sort replacements backwards by start offset to mutate safely from end to start
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let updated = content;
  for (const rep of sorted) {
    updated = updated.slice(0, rep.start) + rep.newText + updated.slice(rep.end);
  }

  return { updatedContent: updated, changed: true };
}

export function findSourceFiles(rootDir: string): readonly string[] {
  const filePaths: string[] = [];
  const searchDirs = [
    path.join(rootDir, 'packages'),
    path.join(rootDir, 'apps'),
    path.join(rootDir, 'tools'),
  ];

  function walk(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      return;
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'coverage' ||
          entry.name === '.git' ||
          entry.name === 'transpiled' ||
          entry.name === 'mock'
        ) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        if (!entry.name.endsWith('.d.ts')) {
          filePaths.push(fullPath);
        }
      }
    }
  }

  for (const searchDir of searchDirs) {
    walk(searchDir);
  }

  return filePaths;
}

export function runTsRefactoring(options: RefactorOptions = {}): RefactorReport {
  const rootDir = options.rootDir ?? process.cwd();
  const filePaths = findSourceFiles(rootDir);

  const allDuplicateInfos: DuplicateTypeInfo[] = [];
  const allUnindexedImports: UnindexedImportInfo[] = [];
  let fixedFilesCount = 0;

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, 'utf8');

    // Analyze duplicate types
    const duplicates = analyzeDuplicateTypesInFile(filePath, content);
    allDuplicateInfos.push(...duplicates);

    // Analyze unindexed imports
    const unindexed = analyzeUnindexedImportsInFile(filePath, content);
    allUnindexedImports.push(...unindexed);

    // Fix if requested
    if (options.fix && unindexed.length > 0) {
      const { updatedContent, changed } = rewriteUnindexedImportsInContent(content);
      if (changed) {
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        fixedFilesCount += 1;
      }
    }
  }

  // Group duplicate type declarations by structural equivalence and name across different files
  const typeGroupsMap = new Map<string, DuplicateTypeInfo[]>();
  for (const info of allDuplicateInfos) {
    const key = `${info.name}::${info.snippet}`;
    const group = typeGroupsMap.get(key) ?? [];
    typeGroupsMap.set(key, [...group, info]);
  }

  const duplicateTypeGroups: DuplicateTypeGroup[] = [];
  for (const [, occurrences] of typeGroupsMap.entries()) {
    // Only flag as duplicates if present in multiple distinct files
    const distinctFiles = new Set(occurrences.map((occ) => occ.filePath));
    if (distinctFiles.size > 1) {
      duplicateTypeGroups.push({
        name: occurrences[0]?.name ?? 'Unknown',
        occurrences,
      });
    }
  }

  return {
    duplicateTypeGroups,
    unindexedImports: allUnindexedImports,
    fixedFilesCount,
  };
}
