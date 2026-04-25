/* eslint-disable functional/no-classes */
/* eslint-disable functional/no-this-expressions */
import type { Graph, QueryResult, Result, ValidationResult, QueryNode } from '@canopy/types';
import { err } from '@canopy/types';
import { query as createQuery, nodes } from './pipeline';
import { executeQuery } from './engine';
import { pipe } from 'remeda';

export interface QueryEngine {
  readonly execute: (
    graph: Graph,
    query: string | QueryNode,
    params?: Record<string, unknown>,
  ) => Result<QueryResult, Error>;
  readonly validate: (query: string | QueryNode) => ValidationResult;
}

export class CypherQueryEngine implements QueryEngine {
  execute(
    graph: Graph,
    query: string | QueryNode,
    _params: Record<string, unknown> = {},
  ): Result<QueryResult, Error> {
    const queryString = typeof query === 'string' ? query : this.extractQueryString(query);

    // Basic parser for MATCH (n:Type) or MATCH (n)
    const matchRegex =
      /^\s*MATCH\s+\(\s*(?:[a-zA-Z0-9_]+)?\s*(?::\s*([a-zA-Z0-9_]+))?\s*\)\s*(?:RETURN\s+[a-zA-Z0-9_]+\s*)?$/i;
    const match = matchRegex.exec(queryString);

    if (match) {
      const type = match[1];
      const pipelineQuery = pipe(createQuery(), nodes(type));
      return executeQuery(graph, pipelineQuery);
    }

    // Stub implementation for unsupported queries
    // In the future, this will parse Cypher more completely and execute it against the graph
    return err(new Error(`Cypher query execution is not yet implemented. Query: ${queryString}`));
  }

  validate(_query: string | QueryNode): ValidationResult {
    // Stub implementation
    return { valid: true, errors: [] };
  }

  private extractQueryString(query: QueryNode): string {
    const q = query.properties.get('query');
    if (typeof q === 'string') {
      return q;
    }
    return '';
  }
}
