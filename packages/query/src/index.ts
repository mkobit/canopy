// @ts-ignore
import { parse } from 'cypher-parser';
import { GraphEngine } from '@pkms/core';

export class QueryExecutor {
  constructor(private engine: GraphEngine) {}

  execute(query: string) {
    const ast = parse(query);
    console.warn('Executing query:', ast);
    // Placeholder execution logic
    return [];
  }
}
