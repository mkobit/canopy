import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface TypeSpecScalar {
  readonly name: string;
  readonly baseType: string;
  readonly deprecated?: string | undefined;
}

export interface TypeSpecEnumMember {
  readonly name: string;
  readonly value: string;
}

export interface TypeSpecEnum {
  readonly name: string;
  readonly extensible: boolean;
  readonly deprecated?: string | undefined;
  readonly members: readonly TypeSpecEnumMember[];
}

export interface TypeSpecField {
  readonly name: string;
  readonly typeName: string;
  readonly optional: boolean;
  readonly location: 'body' | 'path' | 'query';
  readonly deprecated?: string | undefined;
}

export interface TypeSpecModel {
  readonly name: string;
  readonly namespaceName: string;
  readonly deprecated?: string | undefined;
  readonly fields: readonly TypeSpecField[];
}

export type TypeSpecHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface TypeSpecOperation {
  readonly name: string;
  readonly namespaceName: string;
  readonly method: TypeSpecHttpMethod;
  readonly path: string;
  readonly pathParams: readonly string[];
  readonly requestModel: string;
  readonly responseModel: string;
  readonly deprecated?: string | undefined;
}

export interface TypeSpecNamespace {
  readonly name: string;
  readonly routePrefix: string;
  readonly operations: readonly TypeSpecOperation[];
}

export interface TypeSpecWitInterface {
  readonly name: string;
  readonly body: string;
  readonly deprecated?: string | undefined;
}

export interface TypeSpecWitWorld {
  readonly name: string;
  readonly body: string;
  readonly deprecated?: string | undefined;
}

export interface TypeSpecServiceIr {
  readonly serviceTitle: string;
  readonly version: string;
  readonly scalars: readonly TypeSpecScalar[];
  readonly enums: readonly TypeSpecEnum[];
  readonly models: readonly TypeSpecModel[];
  readonly namespaces: readonly TypeSpecNamespace[];
  readonly witPackage: string;
  readonly witInterfaces: readonly TypeSpecWitInterface[];
  readonly witWorlds: readonly TypeSpecWitWorld[];
}

export type TypeSpecParseResult =
  Readonly<{ ok: true; value: TypeSpecServiceIr }> | Readonly<{ ok: false; error: string }>;

export interface TypeSpecCodegenArtifacts {
  readonly contractTs: string;
  readonly witSpecText: string;
  readonly witSpecTs: string;
  readonly typespecBaselineJson: string;
  readonly witBaselineText: string;
}

interface ParsedDecorator {
  readonly name: string;
  readonly rawArgument?: string | undefined;
}

interface ParsedHeader {
  readonly decorators: readonly ParsedDecorator[];
  readonly nextIndex: number;
}

interface AccumulatorState {
  readonly serviceTitle: string;
  readonly version: string;
  readonly scalars: readonly TypeSpecScalar[];
  readonly enums: readonly TypeSpecEnum[];
  readonly models: readonly TypeSpecModel[];
  readonly namespaces: readonly TypeSpecNamespace[];
  readonly witPackage: string;
  readonly witInterfaces: readonly TypeSpecWitInterface[];
  readonly witWorlds: readonly TypeSpecWitWorld[];
}

const WHITESPACE_CHARS = new Set([' ', '\n', '\r', '\t']);
const NUMERIC_TYPED_NAMES = new Set(['int32', 'int64', 'uint32', 'uint64', 'float64']);

const isWhitespace = (ch: string): boolean => WHITESPACE_CHARS.has(ch);

const isIdentifierChar = (ch: string): boolean => /[A-Za-z0-9_.]/.test(ch);

const skipWhitespace = (source: string, index: number): number => {
  if (index >= source.length) return index;
  const ch = source[index] ?? '';
  return isWhitespace(ch) ? skipWhitespace(source, index + 1) : index;
};

const scanTripleQuotedEnd = (source: string, index: number): number => {
  const found = source.indexOf('"""', index);
  return found === -1 ? source.length : found + 3;
};

const scanDoubleQuotedEnd = (source: string, index: number): number => {
  if (index >= source.length) return index;
  const ch = source[index] ?? '';
  if (ch === '\\') return scanDoubleQuotedEnd(source, index + 2);
  return ch === '"' ? index + 1 : scanDoubleQuotedEnd(source, index + 1);
};

const findNextCommentOrStringIndex = (source: string, fromIndex: number): number => {
  const quoteIndex = source.indexOf('"', fromIndex);
  const commentIndex = source.indexOf('//', fromIndex);
  if (quoteIndex === -1) return commentIndex;
  return commentIndex === -1 ? quoteIndex : Math.min(quoteIndex, commentIndex);
};

const stripLineCommentsStep = (
  source: string,
  index: number,
  chunks: readonly string[],
): string => {
  if (index >= source.length) return chunks.join('');
  if (source.startsWith('"""', index)) {
    const end = scanTripleQuotedEnd(source, index + 3);
    return stripLineCommentsStep(source, end, [...chunks, source.slice(index, end)]);
  }
  const ch = source[index] ?? '';
  if (ch === '"') {
    const end = scanDoubleQuotedEnd(source, index + 1);
    return stripLineCommentsStep(source, end, [...chunks, source.slice(index, end)]);
  }
  if (source.startsWith('//', index)) {
    const newline = source.indexOf('\n', index);
    return newline === -1 ? chunks.join('') : stripLineCommentsStep(source, newline, chunks);
  }
  const nextSpecial = findNextCommentOrStringIndex(source, index);
  const sliceEnd = nextSpecial === -1 ? source.length : Math.max(nextSpecial, index + 1);
  return stripLineCommentsStep(source, sliceEnd, [...chunks, source.slice(index, sliceEnd)]);
};

const stripLineComments = (source: string): string => stripLineCommentsStep(source, 0, []);

const scanBalancedParenEnd = (source: string, index: number, depth: number): number => {
  if (index >= source.length) return index;
  if (source.startsWith('"""', index)) {
    return scanBalancedParenEnd(source, scanTripleQuotedEnd(source, index + 3), depth);
  }
  const ch = source[index] ?? '';
  if (ch === '"') {
    return scanBalancedParenEnd(source, scanDoubleQuotedEnd(source, index + 1), depth);
  }
  if (ch === '(') return scanBalancedParenEnd(source, index + 1, depth + 1);
  return ch === ')'
    ? depth <= 1
      ? index + 1
      : scanBalancedParenEnd(source, index + 1, depth - 1)
    : scanBalancedParenEnd(source, index + 1, depth);
};

const scanBalancedBraceEnd = (source: string, index: number, depth: number): number => {
  if (index >= source.length) return index;
  if (source.startsWith('"""', index)) {
    return scanBalancedBraceEnd(source, scanTripleQuotedEnd(source, index + 3), depth);
  }
  const ch = source[index] ?? '';
  if (ch === '"') {
    return scanBalancedBraceEnd(source, scanDoubleQuotedEnd(source, index + 1), depth);
  }
  if (ch === '{') return scanBalancedBraceEnd(source, index + 1, depth + 1);
  return ch === '}'
    ? depth <= 1
      ? index + 1
      : scanBalancedBraceEnd(source, index + 1, depth - 1)
    : scanBalancedBraceEnd(source, index + 1, depth);
};

const readIdentifier = (
  source: string,
  index: number,
): Readonly<{ value: string; nextIndex: number }> => {
  const scan = (cursor: number): number => {
    if (cursor >= source.length) return cursor;
    return isIdentifierChar(source[cursor] ?? '') ? scan(cursor + 1) : cursor;
  };
  const end = scan(index);
  return { value: source.slice(index, end), nextIndex: end };
};

const parseDecoratorsStep = (
  source: string,
  index: number,
  collected: readonly ParsedDecorator[],
): ParsedHeader => {
  const cursor = skipWhitespace(source, index);
  if (source[cursor] !== '@') {
    return { decorators: collected, nextIndex: cursor };
  }
  const id = readIdentifier(source, cursor + 1);
  const afterId = skipWhitespace(source, id.nextIndex);
  if (source[afterId] !== '(') {
    return parseDecoratorsStep(source, afterId, [...collected, { name: id.value }]);
  }
  const closeParen = scanBalancedParenEnd(source, afterId + 1, 1);
  const rawArgument = source.slice(afterId + 1, closeParen - 1).trim();
  return parseDecoratorsStep(source, closeParen, [...collected, { name: id.value, rawArgument }]);
};

const dedentTripleQuoted = (raw: string): string => {
  const normalized = raw.replaceAll('\r\n', '\n');
  const lines = normalized.split('\n');
  const trimmedLeading = lines[0]?.trim() === '' ? lines.slice(1) : lines;
  const trimmedTrailing =
    trimmedLeading.at(-1)?.trim() === '' ? trimmedLeading.slice(0, -1) : trimmedLeading;
  const indents = trimmedTrailing
    .filter((line) => line.trim().length > 0)
    .map((line) => /^ */.exec(line)?.[0].length ?? 0);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return trimmedTrailing.map((line) => line.slice(minIndent)).join('\n');
};

const unquoteString = (raw: string | undefined): string | undefined => {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('"""') && trimmed.endsWith('"""')) {
    return dedentTripleQuoted(trimmed.slice(3, -3));
  }
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed
        .slice(1, -1)
        .replaceAll(String.raw`\"`, '"')
        .replaceAll(String.raw`\n`, '\n')
        .replaceAll(String.raw`\\`, '\\')
    : undefined;
};

const findDecorator = (
  decorators: readonly ParsedDecorator[],
  name: string,
): ParsedDecorator | undefined => decorators.find((decorator) => decorator.name === name);

const extractServiceInfo = (
  decorators: readonly ParsedDecorator[],
  current: Readonly<{ serviceTitle: string; version: string }>,
): Readonly<{ serviceTitle: string; version: string }> => {
  const service = findDecorator(decorators, 'service');
  if (!service?.rawArgument) return current;
  const titleMatch = /title\s*:\s*"([^"]*)"/.exec(service.rawArgument);
  const versionMatch = /version\s*:\s*"([^"]*)"/.exec(service.rawArgument);
  return {
    serviceTitle: titleMatch?.[1] ?? current.serviceTitle,
    version: versionMatch?.[1] ?? current.version,
  };
};

const extractDeprecated = (decorators: readonly ParsedDecorator[]): string | undefined => {
  const decorator = findDecorator(decorators, 'deprecated');
  return decorator === undefined
    ? undefined
    : (unquoteString(decorator.rawArgument) ?? 'deprecated');
};

const parseEnumMembers = (body: string): readonly TypeSpecEnumMember[] =>
  body
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line): readonly TypeSpecEnumMember[] => {
      const cleaned = line.endsWith(';') ? line.slice(0, -1).trim() : line;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*"([^"]*)")?$/.exec(cleaned);
      return match?.[1] ? [{ name: match[1], value: match[2] ?? match[1] }] : [];
    });

const splitTopLevelSemicolonStatements = (
  body: string,
  index: number,
  start: number,
  collected: readonly string[],
): readonly string[] => {
  if (index >= body.length) {
    const tail = body.slice(start).trim();
    return tail.length > 0 ? [...collected, tail] : collected;
  }
  const ch = body[index] ?? '';
  if (ch === '"') {
    return splitTopLevelSemicolonStatements(
      body,
      scanDoubleQuotedEnd(body, index + 1),
      start,
      collected,
    );
  }
  if (ch === '(') {
    return splitTopLevelSemicolonStatements(
      body,
      scanBalancedParenEnd(body, index + 1, 1),
      start,
      collected,
    );
  }
  if (ch === ';') {
    const piece = body.slice(start, index).trim();
    return splitTopLevelSemicolonStatements(
      body,
      index + 1,
      index + 1,
      piece.length > 0 ? [...collected, piece] : collected,
    );
  }
  return splitTopLevelSemicolonStatements(body, index + 1, start, collected);
};

const parseModelFields = (body: string): readonly TypeSpecField[] =>
  splitTopLevelSemicolonStatements(body, 0, 0, []).flatMap(
    (statement): readonly TypeSpecField[] => {
      const header = parseDecoratorsStep(statement, 0, []);
      const remainder = statement.slice(header.nextIndex).trim();
      const match = /^([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*:\s*(.+)$/.exec(remainder);
      if (!match?.[1] || !match[3]) return [];
      const location = findDecorator(header.decorators, 'path')
        ? 'path'
        : findDecorator(header.decorators, 'query')
          ? 'query'
          : 'body';
      const deprecated = extractDeprecated(header.decorators);
      return [
        {
          name: match[1],
          typeName: match[3].trim(),
          optional: Boolean(match[2]),
          location,
          ...(deprecated !== undefined && { deprecated }),
        },
      ];
    },
  );

const joinRoutePaths = (prefix: string, suffix: string): string => {
  const combined = `${prefix}/${suffix}`.replaceAll(/\/+/g, '/');
  if (combined.length > 1 && combined.endsWith('/')) {
    return combined.slice(0, -1);
  }
  return combined.startsWith('/') ? combined : `/${combined}`;
};

const extractPathParameters = (routePath: string): readonly string[] => {
  const matches = routePath.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g);
  return [...matches].map((match) => match[1] ?? '').filter((name) => name.length > 0);
};

const resolveHttpMethod = (decorators: readonly ParsedDecorator[]): TypeSpecHttpMethod => {
  if (findDecorator(decorators, 'post')) return 'POST';
  if (findDecorator(decorators, 'put')) return 'PUT';
  if (findDecorator(decorators, 'patch')) return 'PATCH';
  return findDecorator(decorators, 'delete') ? 'DELETE' : 'GET';
};

const extractRequestModel = (parameterText: string): string => {
  const cleaned = parameterText.trim();
  return cleaned.length === 0
    ? 'Record<string, never>'
    : (cleaned.split(':').at(-1)?.trim() ?? 'Record<string, never>');
};

const parseBlockStatements = (
  source: string,
  index: number,
  namespaceName: string,
  routePrefix: string,
  state: AccumulatorState,
): Readonly<{ state: AccumulatorState; error?: string }> => {
  const header = parseDecoratorsStep(source, index, []);
  if (header.nextIndex >= source.length) {
    return { state };
  }

  const nextService = extractServiceInfo(header.decorators, {
    serviceTitle: state.serviceTitle,
    version: state.version,
  });
  const witPackage =
    unquoteString(findDecorator(header.decorators, 'witPackage')?.rawArgument) ?? state.witPackage;
  const updatedState: AccumulatorState = {
    ...state,
    serviceTitle: nextService.serviceTitle,
    version: nextService.version,
    witPackage,
  };

  const keyword = readIdentifier(source, header.nextIndex);
  const afterKeyword = skipWhitespace(source, keyword.nextIndex);

  if (keyword.value === 'namespace') {
    return handleNamespaceDeclaration(
      source,
      afterKeyword,
      header.decorators,
      routePrefix,
      updatedState,
    );
  }
  if (keyword.value === 'scalar') {
    return handleScalarDeclaration(
      source,
      afterKeyword,
      header.decorators,
      namespaceName,
      routePrefix,
      updatedState,
    );
  }
  if (keyword.value === 'enum') {
    return handleEnumDeclaration(
      source,
      afterKeyword,
      header.decorators,
      namespaceName,
      routePrefix,
      updatedState,
    );
  }
  if (keyword.value === 'model') {
    return handleModelDeclaration(
      source,
      afterKeyword,
      header.decorators,
      namespaceName,
      routePrefix,
      updatedState,
    );
  }
  if (keyword.value === 'op') {
    return handleOperationDeclaration(
      source,
      afterKeyword,
      header.decorators,
      namespaceName,
      routePrefix,
      updatedState,
    );
  }

  return {
    state: updatedState,
    error: `Unexpected TypeSpec token "${keyword.value}" at offset ${header.nextIndex}`,
  };
};

const handleNamespaceDeclaration = (
  source: string,
  afterKeyword: number,
  decorators: readonly ParsedDecorator[],
  parentRoutePrefix: string,
  state: AccumulatorState,
): Readonly<{ state: AccumulatorState; error?: string }> => {
  const nameId = readIdentifier(source, afterKeyword);
  const afterName = skipWhitespace(source, nameId.nextIndex);
  const shortName = nameId.value.split('.').at(-1) ?? nameId.value;
  const routeDecorator = unquoteString(findDecorator(decorators, 'route')?.rawArgument);
  const nextRoutePrefix = routeDecorator
    ? joinRoutePaths(parentRoutePrefix, routeDecorator)
    : parentRoutePrefix;

  if (source[afterName] === ';') {
    return parseBlockStatements(source, afterName + 1, shortName, nextRoutePrefix, state);
  }
  if (source[afterName] !== '{') {
    return { state, error: `Expected '{' or ';' after namespace ${nameId.value}` };
  }

  const closeBrace = scanBalancedBraceEnd(source, afterName + 1, 1);
  const innerBody = source.slice(afterName + 1, closeBrace - 1);
  const innerResult = parseBlockStatements(innerBody, 0, shortName, nextRoutePrefix, {
    ...state,
    namespaces:
      routeDecorator === undefined
        ? state.namespaces
        : [...state.namespaces, { name: shortName, routePrefix: nextRoutePrefix, operations: [] }],
  });
  return innerResult.error === undefined
    ? parseBlockStatements(source, closeBrace, shortName, parentRoutePrefix, innerResult.state)
    : innerResult;
};

const handleScalarDeclaration = (
  source: string,
  afterKeyword: number,
  decorators: readonly ParsedDecorator[],
  namespaceName: string,
  routePrefix: string,
  state: AccumulatorState,
): Readonly<{ state: AccumulatorState; error?: string }> => {
  const semicolon = source.indexOf(';', afterKeyword);
  if (semicolon === -1) return { state, error: 'Unterminated scalar declaration' };
  const declaration = source.slice(afterKeyword, semicolon).trim();
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s+extends\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(declaration);
  if (!match?.[1] || !match[2]) {
    return { state, error: `Invalid scalar declaration: ${declaration}` };
  }
  const deprecated = extractDeprecated(decorators);
  const scalar: TypeSpecScalar = {
    name: match[1],
    baseType: match[2],
    ...(deprecated !== undefined && { deprecated }),
  };
  return parseBlockStatements(source, semicolon + 1, namespaceName, routePrefix, {
    ...state,
    scalars: [...state.scalars, scalar],
  });
};

const handleEnumDeclaration = (
  source: string,
  afterKeyword: number,
  decorators: readonly ParsedDecorator[],
  namespaceName: string,
  routePrefix: string,
  state: AccumulatorState,
): Readonly<{ state: AccumulatorState; error?: string }> => {
  const nameId = readIdentifier(source, afterKeyword);
  const openBrace = skipWhitespace(source, nameId.nextIndex);
  if (source[openBrace] !== '{') return { state, error: `Expected '{' for enum ${nameId.value}` };
  const closeBrace = scanBalancedBraceEnd(source, openBrace + 1, 1);
  const body = source.slice(openBrace + 1, closeBrace - 1);
  const deprecated = extractDeprecated(decorators);
  const enumEntry: TypeSpecEnum = {
    name: nameId.value,
    extensible: findDecorator(decorators, 'extensible') !== undefined,
    ...(deprecated !== undefined && { deprecated }),
    members: parseEnumMembers(body),
  };
  return parseBlockStatements(source, closeBrace, namespaceName, routePrefix, {
    ...state,
    enums: [...state.enums, enumEntry],
  });
};

const handleModelDeclaration = (
  source: string,
  afterKeyword: number,
  decorators: readonly ParsedDecorator[],
  namespaceName: string,
  routePrefix: string,
  state: AccumulatorState,
): Readonly<{ state: AccumulatorState; error?: string }> => {
  const nameId = readIdentifier(source, afterKeyword);
  const openBrace = skipWhitespace(source, nameId.nextIndex);
  if (source[openBrace] !== '{') return { state, error: `Expected '{' for model ${nameId.value}` };
  const closeBrace = scanBalancedBraceEnd(source, openBrace + 1, 1);
  const body = source.slice(openBrace + 1, closeBrace - 1);
  const deprecated = extractDeprecated(decorators);
  const witInterfaceName = unquoteString(findDecorator(decorators, 'witInterface')?.rawArgument);
  const witWorldName = unquoteString(findDecorator(decorators, 'witWorld')?.rawArgument);
  const witBody = unquoteString(findDecorator(decorators, 'witBody')?.rawArgument) ?? '';

  if (witInterfaceName !== undefined) {
    const entry: TypeSpecWitInterface = {
      name: witInterfaceName,
      body: witBody,
      ...(deprecated !== undefined && { deprecated }),
    };
    return parseBlockStatements(source, closeBrace, namespaceName, routePrefix, {
      ...state,
      witInterfaces: [...state.witInterfaces, entry],
    });
  }

  if (witWorldName !== undefined) {
    const entry: TypeSpecWitWorld = {
      name: witWorldName,
      body: witBody,
      ...(deprecated !== undefined && { deprecated }),
    };
    return parseBlockStatements(source, closeBrace, namespaceName, routePrefix, {
      ...state,
      witWorlds: [...state.witWorlds, entry],
    });
  }

  const modelEntry: TypeSpecModel = {
    name: nameId.value,
    namespaceName,
    ...(deprecated !== undefined && { deprecated }),
    fields: parseModelFields(body),
  };
  return parseBlockStatements(source, closeBrace, namespaceName, routePrefix, {
    ...state,
    models: [...state.models, modelEntry],
  });
};

const handleOperationDeclaration = (
  source: string,
  afterKeyword: number,
  decorators: readonly ParsedDecorator[],
  namespaceName: string,
  routePrefix: string,
  state: AccumulatorState,
): Readonly<{ state: AccumulatorState; error?: string }> => {
  const nameId = readIdentifier(source, afterKeyword);
  const openParen = skipWhitespace(source, nameId.nextIndex);
  if (source[openParen] !== '(') return { state, error: `Expected '(' for op ${nameId.value}` };
  const closeParen = scanBalancedParenEnd(source, openParen + 1, 1);
  const semicolon = source.indexOf(';', closeParen);
  if (semicolon === -1) return { state, error: `Unterminated op ${nameId.value}` };
  const returnPart = source.slice(closeParen, semicolon).trim();
  const returnMatch = /^:\s*([A-Za-z_][A-Za-z0-9_]*)$/.exec(returnPart);
  if (!returnMatch?.[1]) {
    return { state, error: `Invalid op return type for ${nameId.value}: ${returnPart}` };
  }
  const opRouteSuffix = unquoteString(findDecorator(decorators, 'route')?.rawArgument) ?? '';
  const fullPath = joinRoutePaths(routePrefix, opRouteSuffix);
  const deprecated = extractDeprecated(decorators);
  const operation: TypeSpecOperation = {
    name: nameId.value,
    namespaceName,
    method: resolveHttpMethod(decorators),
    path: fullPath,
    pathParams: extractPathParameters(fullPath),
    requestModel: extractRequestModel(source.slice(openParen + 1, closeParen - 1)),
    responseModel: returnMatch[1],
    ...(deprecated !== undefined && { deprecated }),
  };

  const existingIndex = state.namespaces.findIndex((ns) => ns.name === namespaceName);
  const nextNamespaces =
    existingIndex === -1
      ? [...state.namespaces, { name: namespaceName, routePrefix, operations: [operation] }]
      : state.namespaces.map((ns, index) =>
          index === existingIndex ? { ...ns, operations: [...ns.operations, operation] } : ns,
        );

  return parseBlockStatements(source, semicolon + 1, namespaceName, routePrefix, {
    ...state,
    namespaces: nextNamespaces,
  });
};

export const parseTypeSpecService = (source: string): TypeSpecParseResult => {
  const stripped = stripLineComments(source);
  const initialState: AccumulatorState = {
    serviceTitle: 'Canopy v0 API',
    version: '0.0.0',
    scalars: [],
    enums: [],
    models: [],
    namespaces: [],
    witPackage: 'canopy:graph',
    witInterfaces: [],
    witWorlds: [],
  };
  const parsed = parseBlockStatements(stripped, 0, 'Canopy.V0', '', initialState);
  return parsed.error === undefined
    ? { ok: true, value: parsed.state }
    : { ok: false, error: parsed.error };
};

const scalarTsName = (name: string): string => `CanopyV0${name}`;

const scalarBaseToTs = (baseType: string): string => {
  if (baseType === 'boolean') return 'boolean';
  return NUMERIC_TYPED_NAMES.has(baseType) ? 'number' : 'string';
};

const toTsType = (typeName: string, scalarSet: ReadonlySet<string>): string => {
  if (typeName.endsWith('[]')) {
    const inner = typeName.slice(0, -2).trim();
    return `readonly ${toTsType(inner, scalarSet)}[]`;
  }
  if (scalarSet.has(typeName)) return scalarTsName(typeName);
  if (NUMERIC_TYPED_NAMES.has(typeName)) return 'number';
  return typeName === 'boolean' || typeName === 'string' ? typeName : typeName;
};

const toScreamingSnakeCase = (value: string): string =>
  value.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

const formatStringArrayLiteral = (constName: string, values: readonly string[]): string => {
  const inline = `[${values.map((v) => `'${v}'`).join(', ')}]`;
  const singleLine = `export const ${constName} = ${inline} as const;`;
  return singleLine.length <= 100
    ? singleLine
    : `export const ${constName} = [\n${values.map((v) => `  '${v}',`).join('\n')}\n] as const;`;
};

const emitEnumBlock = (enumDefinition: TypeSpecEnum): string => {
  const constName = `${toScreamingSnakeCase(enumDefinition.name)}_VALUES`;
  const declaration = formatStringArrayLiteral(
    constName,
    enumDefinition.members.map((member) => member.value),
  );
  const typeAlias = `export type ${enumDefinition.name} = (typeof ${constName})[number];`;
  return `${declaration}\n${typeAlias}`;
};

const emitModelBlock = (model: TypeSpecModel, scalarSet: ReadonlySet<string>): string => {
  const fields = model.fields
    .map((field) => {
      const tsType = toTsType(field.typeName, scalarSet);
      return field.optional
        ? `  readonly ${field.name}?: ${tsType} | undefined;`
        : `  readonly ${field.name}: ${tsType};`;
    })
    .join('\n');
  return fields.length === 0
    ? `export type ${model.name} = Readonly<Record<string, never>>;`
    : `export interface ${model.name} {\n${fields}\n}`;
};

const emitRouteEntry = (operation: TypeSpecOperation): string => {
  const parametersLiteral =
    operation.pathParams.length === 0
      ? '[]'
      : `[${operation.pathParams.map((parameter) => `'${parameter}'`).join(', ')}]`;
  const deprecatedLine =
    operation.deprecated === undefined ? '' : `\n    deprecated: '${operation.deprecated}',`;
  return [
    '  {',
    `    id: '${operation.namespaceName}.${operation.name}',`,
    `    namespace: '${operation.namespaceName}',`,
    `    operation: '${operation.name}',`,
    `    method: '${operation.method}',`,
    `    path: '${operation.path}',`,
    `    pathParams: ${parametersLiteral},${deprecatedLine}`,
    '  },',
  ].join('\n');
};

const emitNamespaceHandlerInterface = (namespaceDefinition: TypeSpecNamespace): string => {
  const methods = namespaceDefinition.operations
    .map((operation) =>
      [
        `  readonly ${operation.name}: (`,
        `    request: ${operation.requestModel},`,
        `  ) => Promise<GraphAccessResponse<${operation.responseModel}>>;`,
      ].join('\n'),
    )
    .join('\n');
  return `export interface CanopyV0${namespaceDefinition.name}Handlers {\n${methods}\n}`;
};

export const emitCanopyV0ContractModule = (ir: TypeSpecServiceIr): string => {
  const scalarSet = new Set(ir.scalars.map((scalar) => scalar.name));
  const scalarBlocks = ir.scalars
    .map(
      (scalar) => `export type ${scalarTsName(scalar.name)} = ${scalarBaseToTs(scalar.baseType)};`,
    )
    .join('\n');
  const enumBlocks = ir.enums.map(emitEnumBlock).join('\n\n');
  const modelBlocks = ir.models.map((model) => emitModelBlock(model, scalarSet)).join('\n\n');
  const namespaceNames = ir.namespaces.map((ns) => `'${ns.name}'`).join(' | ');
  const namespaceTypeLine = `export type CanopyV0NamespaceName = ${namespaceNames};`;
  const namespaceTypeDeclaration =
    namespaceTypeLine.length <= 100
      ? namespaceTypeLine
      : `export type CanopyV0NamespaceName =\n  ${namespaceNames};`;
  const operationIds = ir.namespaces
    .flatMap((ns) => ns.operations.map((op) => `  | '${ns.name}.${op.name}'`))
    .join('\n');
  const routesEntries = ir.namespaces
    .flatMap((ns) => ns.operations)
    .map(emitRouteEntry)
    .join('\n');
  const handlerInterfaces = ir.namespaces.map(emitNamespaceHandlerInterface).join('\n\n');
  const serviceHandlersFields = ir.namespaces
    .map((ns) => `  readonly ${ns.name.toLowerCase()}: CanopyV0${ns.name}Handlers;`)
    .join('\n');

  return [
    '// AUTOGENERATED FILE FROM packages/graph-access/typespec/main.tsp - DO NOT EDIT MANUALLY',
    "import type { GraphAccessResponse } from './graph-access-payloads';",
    '',
    `export const CANOPY_V0_SERVICE_TITLE = '${ir.serviceTitle}';`,
    `export const CANOPY_V0_CONTRACT_VERSION = '${ir.version}';`,
    '',
    scalarBlocks,
    '',
    enumBlocks,
    '',
    modelBlocks,
    '',
    "export type CanopyV0HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';",
    namespaceTypeDeclaration,
    `export type CanopyV0RouteOperationId =\n${operationIds};`,
    '',
    'export interface CanopyV0RouteDescriptor {',
    '  readonly id: CanopyV0RouteOperationId;',
    '  readonly namespace: CanopyV0NamespaceName;',
    '  readonly operation: string;',
    '  readonly method: CanopyV0HttpMethod;',
    '  readonly path: string;',
    '  readonly pathParams: readonly string[];',
    '  readonly deprecated?: string | undefined;',
    '}',
    '',
    `export const CANOPY_V0_ROUTES: readonly CanopyV0RouteDescriptor[] = [\n${routesEntries}\n];`,
    '',
    handlerInterfaces,
    '',
    `export interface CanopyV0ServiceHandlers {\n${serviceHandlersFields}\n}`,
    '',
  ].join('\n');
};

const indentWitLines = (body: string): string =>
  body
    .split('\n')
    .map((line) => (line.length === 0 ? '' : `  ${line}`))
    .join('\n');

export const emitUnifiedWitSpec = (ir: TypeSpecServiceIr): string => {
  const interfaceBlocks = ir.witInterfaces
    .map((iface) => `interface ${iface.name} {\n${indentWitLines(iface.body)}\n}`)
    .join('\n\n');
  const worldBlocks = ir.witWorlds
    .map((world) => `world ${world.name} {\n${indentWitLines(world.body)}\n}`)
    .join('\n\n');
  return `package ${ir.witPackage};\n\n${interfaceBlocks}\n\n${worldBlocks}\n`;
};

export const emitCanopyWitSpecModule = (ir: TypeSpecServiceIr): string => {
  const witSpecText = emitUnifiedWitSpec(ir);
  return [
    '// AUTOGENERATED FILE FROM packages/graph-access/typespec/main.tsp - DO NOT EDIT MANUALLY',
    '// WebAssembly Interface Type (WIT) specifications for Canopy Graph API host and guest interfaces.',
    `export const CANOPY_WIT_SPECIFICATION = \`${witSpecText}\`;`,
    '',
  ].join('\n');
};

export const emitTypeSpecBaselineJson = (ir: TypeSpecServiceIr): string =>
  `${JSON.stringify(ir, undefined, 2)}\n`;

export const generateAllCodegenArtifacts = (ir: TypeSpecServiceIr): TypeSpecCodegenArtifacts => {
  const witSpecText = emitUnifiedWitSpec(ir);
  return {
    contractTs: emitCanopyV0ContractModule(ir),
    witSpecText,
    witSpecTs: emitCanopyWitSpecModule(ir),
    typespecBaselineJson: emitTypeSpecBaselineJson(ir),
    witBaselineText: `/* AUTOGENERATED BASELINE FILE - DO NOT EDIT MANUALLY */\n${witSpecText}`,
  };
};

export const getDefaultTypeSpecSourcePath = (rootDirectory: string): string =>
  path.join(rootDirectory, 'packages/graph-access/typespec/main.tsp');

export const loadAndParseTypeSpecFromDisk = (sourcePath: string): TypeSpecParseResult => {
  const source = readFileSync(sourcePath, 'utf8');
  return parseTypeSpecService(source);
};
