import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type SourceAlias = Readonly<{
  name: string;
  target: string;
}>;

export type SourceImportBoundary = Readonly<{
  sourceRoot: string;
  forbiddenPackage: string;
  forbiddenRoot: string;
  aliases?: readonly SourceAlias[];
}>;

export type SourceImportViolation = Readonly<{
  importer: string;
  specifier: string;
  forbiddenPackage: string;
}>;

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);

const listProductionFiles = (root: string): readonly string[] =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => sourceExtensions.has(path.extname(file)))
    .filter((file) => !file.includes(`${path.sep}--tests--${path.sep}`))
    .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
    .toSorted((left, right) => left.localeCompare(right));

const moduleSpecifierForNode = (node: ts.Node): readonly string[] => {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return [node.moduleSpecifier.text];
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    return [node.argument.literal.text];
  }
  const dynamicImportArgument = ts.isCallExpression(node) ? node.arguments[0] : undefined;
  return dynamicImportArgument !== undefined &&
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(dynamicImportArgument)
    ? [dynamicImportArgument.text]
    : [];
};

const collectModuleSpecifiers = (node: ts.Node): readonly string[] => [
  ...moduleSpecifierForNode(node),
  ...node.getChildren().flatMap(collectModuleSpecifiers),
];

const normalize = (value: string): string => path.resolve(value);

const resolvesInside = (candidate: string, root: string): boolean => {
  const relative = path.relative(normalize(root), normalize(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const resolveAlias = (specifier: string, aliases: readonly SourceAlias[]): string | undefined => {
  const exact = aliases.find((alias) => alias.name === specifier);
  if (exact !== undefined) return exact.target;
  const wildcard = aliases.find((alias) => {
    const marker = alias.name.indexOf('*');
    return marker !== -1 && specifier.startsWith(alias.name.slice(0, marker));
  });
  if (wildcard === undefined) return undefined;
  const marker = wildcard.name.indexOf('*');
  const suffix = specifier.slice(marker);
  const targetMarker = wildcard.target.indexOf('*');
  return targetMarker === -1
    ? wildcard.target
    : `${wildcard.target.slice(0, targetMarker)}${suffix}${wildcard.target.slice(targetMarker + 1)}`;
};

const isForbiddenSpecifier = (
  importer: string,
  specifier: string,
  boundary: SourceImportBoundary,
): boolean => {
  if (
    specifier === boundary.forbiddenPackage ||
    specifier.startsWith(`${boundary.forbiddenPackage}/`)
  ) {
    return true;
  }
  if (specifier.startsWith('.')) {
    return resolvesInside(path.resolve(path.dirname(importer), specifier), boundary.forbiddenRoot);
  }
  const aliasTarget = resolveAlias(specifier, boundary.aliases ?? []);
  return aliasTarget === undefined ? false : resolvesInside(aliasTarget, boundary.forbiddenRoot);
};

export const findForbiddenImportsInSource = (
  importer: string,
  source: string,
  boundary: SourceImportBoundary,
): readonly SourceImportViolation[] => {
  const sourceFile = ts.createSourceFile(
    importer,
    source,
    ts.ScriptTarget.Latest,
    true,
    importer.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return collectModuleSpecifiers(sourceFile)
    .filter((specifier) => isForbiddenSpecifier(importer, specifier, boundary))
    .map((specifier) => ({
      importer,
      specifier,
      forbiddenPackage: boundary.forbiddenPackage,
    }));
};

export const readTypescriptAliases = (configPath: string): readonly SourceAlias[] => {
  const parsed = ts.parseConfigFileTextToJson(configPath, readFileSync(configPath, 'utf8'));
  if (parsed.error !== undefined) return [];
  const config = parsed.config as Readonly<{
    compilerOptions?: Readonly<{
      paths?: Readonly<Record<string, readonly string[]>>;
    }>;
  }>;
  return Object.entries(config.compilerOptions?.paths ?? {}).flatMap(([name, targets]) => {
    const target = targets[0];
    return target === undefined
      ? []
      : [{ name, target: path.resolve(path.dirname(configPath), target) }];
  });
};

export const checkSourceImportBoundaries = (
  boundaries: readonly SourceImportBoundary[],
): readonly SourceImportViolation[] =>
  boundaries.flatMap((boundary) =>
    listProductionFiles(boundary.sourceRoot).flatMap((file) =>
      findForbiddenImportsInSource(file, readFileSync(file, 'utf8'), boundary),
    ),
  );
