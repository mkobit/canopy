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

    it('parses string literals into deeply frozen immutable objects', () => {
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

    it('returns null for non-string AST literals', () => {
      const parsed = GraphQLPropertyMap.parseLiteral({
        kind: Kind.INT,
        value: '123',
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

    it('parses string literals into deeply frozen immutable objects', () => {
      const jsonString = '{"key":"value","nested":{"a":1}}';
      const parsed = GraphQLJSON.parseLiteral({
        kind: Kind.STRING,
        value: jsonString,
      }) as { key: string; nested: { a: number } };
      expect(parsed).toEqual({ key: 'value', nested: { a: 1 } });
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.nested)).toBe(true);
    });

    it('returns null for non-string AST literals', () => {
      const parsed = GraphQLJSON.parseLiteral({
        kind: Kind.INT,
        value: '456',
      });
      expect(parsed).toBeNull();
    });
  });
});
