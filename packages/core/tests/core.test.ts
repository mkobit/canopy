import { describe, it, expect } from 'vitest';
import { GraphEngine } from '../src';
import { Node } from '@canopy/schema';

describe('GraphEngine', () => {
  it('adds and retrieves a node', () => {
    const engine = new GraphEngine();
    const node: Node = {
      id: '502f6a9c-0c33-40f4-9029-7c15273d2218',
      labels: ['Person'],
      properties: { name: 'Bob' },
    };

    engine.addNode(node);
    const retrieved = engine.getNode(node.id);
    expect(retrieved).toEqual(node);
  });
});
