import type { Query, QueryStep, Operator } from './model';

export class QueryBuilder {
  protected readonly steps: readonly QueryStep[];

  constructor(steps: readonly QueryStep[] = []) {
    this.steps = steps;
  }

  build(): Query {
    return { steps: this.steps };
  }

  protected addStep<T extends QueryBuilder>(this: T, step: QueryStep): T {
    // This allows subclasses to return their own type via constructor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = this.constructor as new (steps: readonly QueryStep[]) => T;
    return new Ctor([...this.steps, step]);
  }
}

// eslint-disable-next-line functional/no-class-inheritance
export class NodeQueryBuilder extends QueryBuilder {
  constructor(stepsOrType?: readonly QueryStep[] | string) {
    if (Array.isArray(stepsOrType)) {
      super(stepsOrType);
    } else {
      super([{ kind: 'node-scan', type: stepsOrType as string }]);
    }
  }

  where(property: string, operator: Operator, value?: unknown): NodeQueryBuilder {
    return this.addStep({ kind: 'filter', predicate: { property, operator, value } });
  }

  orderBy(property: string, direction: 'asc' | 'desc' = 'asc'): NodeQueryBuilder {
    return this.addStep({ kind: 'sort', sort: { property, direction } });
  }

  limit(limit: number): NodeQueryBuilder {
    return this.addStep({ kind: 'limit', limit });
  }

  // Traversal returns a NodeQueryBuilder because it results in Nodes
  traverse(edgeType?: string, direction: 'out' | 'in' | 'both' = 'out'): NodeQueryBuilder {
    return this.addStep({ kind: 'traversal', edgeType, direction });
  }
}

// eslint-disable-next-line functional/no-class-inheritance
export class EdgeQueryBuilder extends QueryBuilder {
  constructor(stepsOrType?: readonly QueryStep[] | string) {
    if (Array.isArray(stepsOrType)) {
      super(stepsOrType);
    } else {
      super([{ kind: 'edge-scan', type: stepsOrType as string }]);
    }
  }

  where(property: string, operator: Operator, value?: unknown): EdgeQueryBuilder {
    return this.addStep({ kind: 'filter', predicate: { property, operator, value } });
  }

  from(nodeId: string): EdgeQueryBuilder {
    return this.addStep({ kind: 'filter', predicate: { property: 'source', operator: 'eq', value: nodeId } });
  }

  to(nodeId: string): EdgeQueryBuilder {
    return this.addStep({ kind: 'filter', predicate: { property: 'target', operator: 'eq', value: nodeId } });
  }

  orderBy(property: string, direction: 'asc' | 'desc' = 'asc'): EdgeQueryBuilder {
    return this.addStep({ kind: 'sort', sort: { property, direction } });
  }

  limit(limit: number): EdgeQueryBuilder {
    return this.addStep({ kind: 'limit', limit });
  }
}

export function query() {
  return {
    nodes: (type?: string) => new NodeQueryBuilder(type),
    edges: (type?: string) => new EdgeQueryBuilder(type),
  };
}
