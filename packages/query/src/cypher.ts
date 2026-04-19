/* eslint-disable functional/no-classes */
/* eslint-disable functional/no-this-expressions */
import type { Graph, QueryResult, Result, ValidationResult, QueryNode } from '@canopy/types';
import { err } from '@canopy/types';
import type { Query, QueryStep } from './model';
import { executeQuery } from './engine';

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

    // eslint-disable-next-line functional/no-try-statements
    try {
      const parsedQuery = this.parseCypher(queryString);
      return executeQuery(graph, parsedQuery);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
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

  private parseCypher(queryString: string): Query {
    const steps: QueryStep[] = [];

    // Very basic regex-based parser for our limited subset
    // MATCH (n)
    // MATCH (n:Person)
    // MATCH (n:Person {name: "Alice"})
    // MATCH (n:Person {name: "Alice"})-[r:KNOWS]->(m)

    // Parse MATCH clause
    const matchMatch = queryString.match(/MATCH\s+(.*?)(\s+RETURN|$)/i);
    if (!matchMatch || !matchMatch[1]) {
      // eslint-disable-next-line functional/no-throw-statements
      throw new Error(`Unsupported Cypher query format: ${queryString}`);
    }

    const matchClause = matchMatch[1];

    // Extract first node pattern (n:Type {props})
    const nodeRegex = /\(\s*[a-zA-Z0-9_]*\s*(?::\s*([a-zA-Z0-9_]+))?\s*(?:\{([^}]*)\})?\s*\)/;
    const nodeMatch = matchClause.match(nodeRegex);

    if (nodeMatch) {
      const nodeType = nodeMatch[1];
      const propsString = nodeMatch[2];

      // eslint-disable-next-line functional/immutable-data
      steps.push({ kind: 'node-scan', type: nodeType });

      if (propsString) {
        // Parse simple props: {name: "Alice", age: 30}
        const propRegex = /([a-zA-Z0-9_]+)\s*:\s*([^,]+)/g;
        // eslint-disable-next-line functional/no-let
        let propMatch;
        // eslint-disable-next-line functional/no-loop-statements
        while ((propMatch = propRegex.exec(propsString)) !== null) {
          if (!propMatch[1] || !propMatch[2]) continue;

          const propName = propMatch[1];
          // eslint-disable-next-line functional/no-let
          let propValue: string | number = propMatch[2].trim();

          if (
            typeof propValue === 'string' &&
            (propValue.startsWith('"') || propValue.startsWith("'"))
          ) {
            propValue = propValue.slice(1, -1);
          } else if (typeof propValue === 'string' && !Number.isNaN(Number(propValue))) {
            propValue = Number(propValue);
          }

          // eslint-disable-next-line functional/immutable-data
          steps.push({
            kind: 'filter',
            predicate: { property: propName, operator: 'eq', value: propValue },
          });
        }
      }

      // Check for relationship pattern -[r:Type]->(m)
      // We only support exactly one hop currently
      const relRegex =
        /-\[\s*[a-zA-Z0-9_]*\s*(?::\s*([a-zA-Z0-9_]+))?\s*\]->\s*\(\s*[a-zA-Z0-9_]*\s*(?::\s*[a-zA-Z0-9_]+)?\s*(?:\{[^}]*\})?\s*\)/;
      const relMatch = matchClause.slice(nodeMatch[0].length).match(relRegex);

      if (relMatch) {
        const edgeType = relMatch[1];
        // eslint-disable-next-line functional/immutable-data
        steps.push({ kind: 'traversal', edgeType, direction: 'out' });
      }
    } else {
      // eslint-disable-next-line functional/no-throw-statements
      throw new Error(`Could not parse MATCH pattern: ${matchClause}`);
    }

    return { steps };
  }
}
