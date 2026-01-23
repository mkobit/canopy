/* eslint-disable functional/no-classes */
/* eslint-disable functional/no-this-expressions */
import type { Graph, QueryResult, Result, ValidationResult, QueryNode } from '@canopy/types';
import { err } from '@canopy/types';

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
    _graph: Graph,
    query: string | QueryNode,
    _params: Record<string, unknown> = {},
  ): Result<QueryResult, Error> {
    const queryString = typeof query === 'string' ? query : this.extractQueryString(query);

    // Stub implementation
    // In the future, this will parse Cypher and execute it against the graph
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
