import { describe, expect, it } from 'bun:test';
import { printSchema } from 'graphql';
import { buildGraphQLSchema } from '../src/graphql/schema';

describe('GraphQL schema compilation', () => {
  it('compiles valid GraphQL schema from SDL', () => {
    const schema = buildGraphQLSchema();
    expect(schema).toBeDefined();
    const printed = printSchema(schema);
    expect(printed).toContain('type NodePayload');
    expect(printed).toContain('type NodeConnection');
    expect(printed).toContain('type Query');
    expect(printed).toContain('type Mutation');
    expect(printed).toContain('type Subscription');
  });
});
