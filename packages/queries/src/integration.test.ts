import { describe, it, expect } from 'bun:test';
import {
  createGraph,
  SYSTEM_IDS,
  asGraphId,
  unwrap,
  addNode,
  createNodeId,
  asDeviceId,
  createInstant,
} from '@canopy/graph';
import { executeStoredQuery, executeView } from './index';

const DEVICE_ID = asDeviceId('00000000-0000-0000-0000-000000000001');

function bootstrappedGraph() {
  return unwrap(createGraph(asGraphId('test-queries'), 'Test'));
}

describe('system queries — bootstrapped graph', () => {
  it('QUERY_ALL_NODES executes', () => {
    const graph = bootstrappedGraph();
    const result = executeStoredQuery(graph, SYSTEM_IDS.QUERY_ALL_NODES);
    expect(result.ok).toBe(true);
  });

  it('QUERY_BY_TYPE executes', () => {
    const graph = bootstrappedGraph();
    const result = executeStoredQuery(graph, SYSTEM_IDS.QUERY_BY_TYPE);
    expect(result.ok).toBe(true);
  });

  it('QUERY_RECENT executes', () => {
    const graph = bootstrappedGraph();
    const result = executeStoredQuery(graph, SYSTEM_IDS.QUERY_RECENT);
    expect(result.ok).toBe(true);
  });
});

describe('system views — bootstrapped graph', () => {
  it('VIEW_ALL_NODES executes and returns no user nodes on an empty graph', () => {
    const graph = bootstrappedGraph();
    const result = executeView(graph, SYSTEM_IDS.VIEW_ALL_NODES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toHaveLength(0);
  });

  it('VIEW_ALL_NODES includes user nodes after creation', () => {
    const base = bootstrappedGraph();
    const userNode = {
      id: createNodeId(),
      type: SYSTEM_IDS.TYPE_MARKDOWN,
      properties: new Map([['content', 'hello']]) as ReadonlyMap<string, string>,
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
    };
    const graphResult = addNode(base, userNode, { deviceId: DEVICE_ID });
    expect(graphResult.ok).toBe(true);
    if (!graphResult.ok) return;

    const viewResult = executeView(graphResult.value.graph, SYSTEM_IDS.VIEW_ALL_NODES);
    expect(viewResult.ok).toBe(true);
    if (!viewResult.ok) return;

    expect(viewResult.value.nodes).toHaveLength(1);
    expect(viewResult.value.nodes[0]?.id).toBe(userNode.id);
  });

  it('VIEW_BY_TYPE executes', () => {
    const graph = bootstrappedGraph();
    const result = executeView(graph, SYSTEM_IDS.VIEW_BY_TYPE);
    expect(result.ok).toBe(true);
  });

  it('VIEW_RECENT executes', () => {
    const graph = bootstrappedGraph();
    const result = executeView(graph, SYSTEM_IDS.VIEW_RECENT);
    expect(result.ok).toBe(true);
  });
});
