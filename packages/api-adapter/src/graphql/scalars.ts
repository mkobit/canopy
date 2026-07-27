import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

const deepFreeze = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  // eslint-disable-next-line unicorn/no-array-reduce -- reduce is required to recursively freeze properties without mutation or loops
  return Object.values(obj as Record<string, unknown>).reduce<T>((acc, prop) => {
    deepFreeze(prop);
    return acc;
  }, obj);
};

const parseAstValue = (ast: ValueNode): unknown => {
  if (ast.kind === Kind.STRING) {
    return ast.value;
  }
  if (ast.kind === Kind.OBJECT) {
    return Object.fromEntries(
      ast.fields.map((field) => [field.name.value, parseAstValue(field.value)]),
    );
  }
  if (ast.kind === Kind.LIST) {
    return ast.values.map(parseAstValue);
  }
  if (ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
    return Number(ast.value);
  }
  if (ast.kind === Kind.BOOLEAN) {
    return ast.value;
  }
  if (ast.kind === Kind.NULL) {
    return null;
  }
  return null;
};

const tryParseJson = (value: string): unknown => {
  // eslint-disable-next-line functional/no-try-statements -- JSON.parse throws on non-JSON string inputs
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const SUPPORTED_AST_KINDS: ReadonlySet<Kind> = new Set([
  Kind.OBJECT,
  Kind.LIST,
  Kind.INT,
  Kind.FLOAT,
  Kind.BOOLEAN,
  Kind.NULL,
]);

const parseLiteral = (ast: ValueNode): unknown => {
  if (ast.kind === Kind.STRING) {
    return deepFreeze(tryParseJson(ast.value));
  }
  if (SUPPORTED_AST_KINDS.has(ast.kind)) {
    return deepFreeze(parseAstValue(ast));
  }
  return null;
};

export const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  description: 'Custom JSON scalar type representing arbitrary JSON values',
  serialize: (value: unknown): unknown => value,
  parseValue: deepFreeze,
  parseLiteral,
});

export const GraphQLPropertyMap = new GraphQLScalarType({
  name: 'PropertyMap',
  description: 'Custom scalar representing graph entity property key-value maps',
  serialize: (value: unknown): unknown => value,
  parseValue: deepFreeze,
  parseLiteral,
});
