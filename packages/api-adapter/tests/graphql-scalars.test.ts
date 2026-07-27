import { describe, expect, it } from 'bun:test';
import { Kind } from 'graphql';
import { GraphQLJSON, GraphQLPropertyMap } from '../src/graphql/scalars';

describe('Custom GraphQL scalars', () => {
  describe('GraphQLPropertyMap', () => {
    it('parses JSON objects into deeply frozen immutable objects', () => {
      const input = { title: 'Test Node', count: 42, nested: { key: 'value' } };
      const parsed = GraphQLPropertyMap.parseValue(input) as typeof input;
      expect(parsed).toEqual(input);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.nested)).toBe(true);
    });

    it('serializes property map values without modification', () => {
      const input = { title: 'Test Node', count: 42 };
      const serialized = GraphQLPropertyMap.serialize(input);
      expect(serialized).toEqual(input);
    });

    it('parses valid JSON string literals into deeply frozen immutable objects', () => {
      const jsonString = '{"title":"Test Node","count":42,"nested":{"key":"value"}}';
      const parsed = GraphQLPropertyMap.parseLiteral({
        kind: Kind.STRING,
        value: jsonString,
      }) as { title: string; count: number; nested: { key: string } };
      expect(parsed).toEqual({
        title: 'Test Node',
        count: 42,
        nested: { key: 'value' },
      });
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.nested)).toBe(true);
    });

    it('returns raw string for non-JSON string AST literals', () => {
      const parsed = GraphQLPropertyMap.parseLiteral({
        kind: Kind.STRING,
        value: 'not valid json',
      });
      expect(parsed).toBe('not valid json');
    });

    it('parses Kind.OBJECT AST literals with string, primitive, and nested fields', () => {
      const parsed = GraphQLPropertyMap.parseLiteral({
        kind: Kind.OBJECT,
        fields: [
          {
            kind: Kind.OBJECT_FIELD,
            name: { kind: Kind.NAME, value: 'strField' },
            value: { kind: Kind.STRING, value: 'plain string' },
          },
          {
            kind: Kind.OBJECT_FIELD,
            name: { kind: Kind.NAME, value: 'intField' },
            value: { kind: Kind.INT, value: '123' },
          },
          {
            kind: Kind.OBJECT_FIELD,
            name: { kind: Kind.NAME, value: 'floatField' },
            value: { kind: Kind.FLOAT, value: '45.67' },
          },
          {
            kind: Kind.OBJECT_FIELD,
            name: { kind: Kind.NAME, value: 'boolField' },
            value: { kind: Kind.BOOLEAN, value: true },
          },
          {
            kind: Kind.OBJECT_FIELD,
            name: { kind: Kind.NAME, value: 'nullField' },
            value: { kind: Kind.NULL },
          },
          {
            kind: Kind.OBJECT_FIELD,
            name: { kind: Kind.NAME, value: 'nestedObj' },
            value: {
              kind: Kind.OBJECT,
              fields: [
                {
                  kind: Kind.OBJECT_FIELD,
                  name: { kind: Kind.NAME, value: 'inner' },
                  value: { kind: Kind.STRING, value: 'val' },
                },
              ],
            },
          },
        ],
      }) as {
        strField: string;
        intField: number;
        floatField: number;
        boolField: boolean;
        nullField: null;
        nestedObj: { inner: string };
      };

      expect(parsed).toEqual({
        strField: 'plain string',
        intField: 123,
        floatField: 45.67,
        boolField: true,
        nullField: null,
        nestedObj: { inner: 'val' },
      });
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.nestedObj)).toBe(true);
    });

    it('parses Kind.LIST AST literals into deeply frozen arrays', () => {
      const parsed = GraphQLPropertyMap.parseLiteral({
        kind: Kind.LIST,
        values: [
          { kind: Kind.STRING, value: 'item1' },
          { kind: Kind.INT, value: '10' },
          {
            kind: Kind.OBJECT,
            fields: [
              {
                kind: Kind.OBJECT_FIELD,
                name: { kind: Kind.NAME, value: 'key' },
                value: { kind: Kind.STRING, value: 'value' },
              },
            ],
          },
        ],
      }) as readonly [string, number, { key: string }];

      expect(parsed).toEqual(['item1', 10, { key: 'value' }]);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed[2])).toBe(true);
    });

    it('parses primitive AST literals (INT, FLOAT, BOOLEAN, NULL)', () => {
      expect(GraphQLPropertyMap.parseLiteral({ kind: Kind.INT, value: '42' })).toBe(42);
      expect(GraphQLPropertyMap.parseLiteral({ kind: Kind.FLOAT, value: '3.14' })).toBe(3.14);
      expect(GraphQLPropertyMap.parseLiteral({ kind: Kind.BOOLEAN, value: false })).toBe(false);
      expect(GraphQLPropertyMap.parseLiteral({ kind: Kind.NULL })).toBeNull();
    });

    it('returns null for unsupported AST literal kinds', () => {
      const parsed = GraphQLPropertyMap.parseLiteral({
        kind: Kind.ENUM,
        value: 'UNSUPPORTED',
      });
      expect(parsed).toBeNull();
    });
  });

  describe('GraphQLJSON', () => {
    it('parses JSON objects into deeply frozen immutable objects', () => {
      const input = { key: 'value', numbers: [1, 2, 3] };
      const parsed = GraphQLJSON.parseValue(input) as typeof input;
      expect(parsed).toEqual(input);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.numbers)).toBe(true);
    });

    it('serializes JSON values without modification', () => {
      const input = { key: 'value' };
      const serialized = GraphQLJSON.serialize(input);
      expect(serialized).toEqual(input);
    });

    it('parses valid JSON string literals into deeply frozen immutable objects', () => {
      const jsonString = '{"key":"value","nested":{"a":1}}';
      const parsed = GraphQLJSON.parseLiteral({
        kind: Kind.STRING,
        value: jsonString,
      }) as { key: string; nested: { a: number } };
      expect(parsed).toEqual({ key: 'value', nested: { a: 1 } });
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.nested)).toBe(true);
    });

    it('returns raw string for non-JSON string AST literals', () => {
      const parsed = GraphQLJSON.parseLiteral({
        kind: Kind.STRING,
        value: 'raw string value',
      });
      expect(parsed).toBe('raw string value');
    });

    it('parses Kind.OBJECT AST literals with string fields directly', () => {
      const parsed = GraphQLJSON.parseLiteral({
        kind: Kind.OBJECT,
        fields: [
          {
            kind: Kind.OBJECT_FIELD,
            name: { kind: Kind.NAME, value: 'str' },
            value: { kind: Kind.STRING, value: 'hello' },
          },
        ],
      });
      expect(parsed).toEqual({ str: 'hello' });
      expect(Object.isFrozen(parsed)).toBe(true);
    });

    it('parses Kind.LIST AST literals', () => {
      const parsed = GraphQLJSON.parseLiteral({
        kind: Kind.LIST,
        values: [
          { kind: Kind.INT, value: '1' },
          { kind: Kind.INT, value: '2' },
        ],
      });
      expect(parsed).toEqual([1, 2]);
      expect(Object.isFrozen(parsed)).toBe(true);
    });

    it('returns null for unsupported AST literal kinds', () => {
      const parsed = GraphQLJSON.parseLiteral({
        kind: Kind.ENUM,
        value: 'SOME_ENUM',
      });
      expect(parsed).toBeNull();
    });
  });
});
