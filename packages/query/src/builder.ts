import { Query, QueryStep, Operator } from './model';

export class QueryBuilder {
  protected steps: QueryStep[] = [];

  constructor(initialSteps: QueryStep[] = []) {
    this.steps = [...initialSteps];
  }

  build(): Query {
    return { steps: this.steps };
  }

  protected addStep(step: QueryStep): this {
    this.steps.push(step);
    return this;
  }
}

export class NodeQueryBuilder extends QueryBuilder {
  constructor(type?: string) {
    super();
    this.addStep({ kind: 'node-scan', type });
  }

  where(property: string, operator: Operator, value?: unknown): this {
    this.addStep({ kind: 'filter', predicate: { property, operator, value } });
    return this;
  }

  orderBy(property: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.addStep({ kind: 'sort', sort: { property, direction } });
    return this;
  }

  limit(limit: number): this {
    this.addStep({ kind: 'limit', limit });
    return this;
  }

  // Traversal returns a NodeQueryBuilder because it results in Nodes
  traverse(edgeType?: string, direction: 'out' | 'in' | 'both' = 'out'): NodeQueryBuilder {
    // We append the traversal step to the current steps
    this.addStep({ kind: 'traversal', edgeType, direction });
    // Since traversal returns nodes, we are still a NodeQueryBuilder (conceptually)
    // but effectively we are starting a "new context" of nodes.
    // However, in a pipeline, we just add the step.
    return this;
  }
}

export class EdgeQueryBuilder extends QueryBuilder {
  constructor(type?: string) {
    super();
    this.addStep({ kind: 'edge-scan', type });
  }

  where(property: string, operator: Operator, value?: unknown): this {
    this.addStep({ kind: 'filter', predicate: { property, operator, value } });
    return this;
  }

  from(nodeId: string): this {
    this.addStep({ kind: 'filter', predicate: { property: 'source', operator: 'eq', value: nodeId } });
    return this;
  }

  to(nodeId: string): this {
    this.addStep({ kind: 'filter', predicate: { property: 'target', operator: 'eq', value: nodeId } });
    return this;
  }

  orderBy(property: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.addStep({ kind: 'sort', sort: { property, direction } });
    return this;
  }

  limit(limit: number): this {
    this.addStep({ kind: 'limit', limit });
    return this;
  }
}

export function query() {
  return {
    nodes: (type?: string) => new NodeQueryBuilder(type),
    edges: (type?: string) => new EdgeQueryBuilder(type),
  };
}
