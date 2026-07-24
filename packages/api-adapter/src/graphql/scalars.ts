import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

const deepFreeze = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  // eslint-disable-next-line unicorn/no-array-reduce -- reduce is required to recursively freeze properties without mutation or loops
  return Object.values(obj as Record<string, unknown>).reduce((acc, prop) => {
    deepFreeze(prop);
    return acc;
  }, obj);
};

const parseAstValue = (ast: ValueNode): unknown => {
  if (ast.kind === Kind.STRING) {
    return JSON.parse(ast.value);
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
  return null;
};

export const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  description: 'Custom JSON scalar type representing arbitrary JSON values',
  serialize: (value: unknown): unknown => value,
  parseValue: deepFreeze,
  parseLiteral: (ast: ValueNode): unknown => {
    if (ast.kind === Kind.STRING) {
      return deepFreeze(JSON.parse(ast.value));
    }
    if (ast.kind === Kind.OBJECT) {
      return deepFreeze(parseAstValue(ast));
    }
    return null;
  },
});

export const GraphQLPropertyMap = new GraphQLScalarType({
  name: 'PropertyMap',
  description: 'Custom scalar representing graph entity property key-value maps',
  serialize: (value: unknown): unknown => value,
  parseValue: deepFreeze,
  parseLiteral: (ast: ValueNode): unknown => {
    if (ast.kind === Kind.STRING) {
      return deepFreeze(JSON.parse(ast.value));
    }
    if (ast.kind === Kind.OBJECT) {
      return deepFreeze(parseAstValue(ast));
    }
    return null;
  },
});
