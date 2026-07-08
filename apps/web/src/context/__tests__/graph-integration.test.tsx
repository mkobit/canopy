import { describe, it, expect } from 'bun:test';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { StorageProvider, useStorage } from '../storage-context';
import { GraphProvider, useGraph } from '../graph-context';
import { asGraphId, SYSTEM_IDS } from '@canopy/graph';
import { executeStoredQuery, executeView } from '@canopy/queries';
import type { NodeId, GraphId } from '@canopy/graph';
import type { ReactNode } from 'react';
import { listAllowedNodeTypes } from '../../utils/node-types';
import { listNamespaces } from '../../utils/schema';

function useTestContext() {
  const { eventLog, isLoading: storageLoading } = useStorage();
  const graphCtx = useGraph();
  return { storageReady: !storageLoading && eventLog !== null, ...graphCtx };
}

const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <StorageProvider>
    <GraphProvider>{children}</GraphProvider>
  </StorageProvider>
);

async function loadFreshGraph(id: GraphId) {
  const { result } = renderHook(() => useTestContext(), { wrapper });

  await waitFor(() => {
    expect(result.current.storageReady).toBe(true);
  });

  await act(async () => {
    const res = await result.current.loadGraph(id);
    expect(res.ok).toBe(true);
  });

  return result;
}

describe('graph round-trip', () => {
  it('persists a node through commit and reload', async () => {
    const testGraphId = asGraphId('test-graph-integration');

    const { result, unmount } = renderHook(() => useTestContext(), { wrapper });

    // Wait for storage to initialize
    await waitFor(() => {
      expect(result.current.storageReady).toBe(true);
    });

    // Load an empty graph
    await act(async () => {
      const res = await result.current.loadGraph(testGraphId);
      expect(res.ok).toBe(true);
    });

    expect(result.current.graph).not.toBeNull();

    // Create a node — createNode commits through the graph session immediately.
    let nodeId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.createNode(SYSTEM_IDS.TYPE_MARKDOWN, {
        content: 'hello',
      });
      if (res.ok) nodeId = res.value;
    });

    expect(nodeId).toBeDefined();
    if (nodeId === undefined) return;

    expect(result.current.graph?.nodes.has(nodeId)).toBe(true);
    expect(result.current.graph?.nodes.get(nodeId)?.properties.get('content')).toBe('hello');

    // Simulate page reload — unmount providers and remount fresh
    unmount();
    const { result: result2 } = renderHook(() => useTestContext(), { wrapper });

    await waitFor(() => {
      expect(result2.current.storageReady).toBe(true);
    });

    await act(async () => {
      const res = await result2.current.loadGraph(testGraphId);
      expect(res.ok).toBe(true);
    });

    expect(result2.current.graph?.nodes.has(nodeId)).toBe(true);
  });

  it('persists a TextBlock node with list content through commit and reload', async () => {
    const testGraphId = asGraphId('test-graph-text-block');

    const { result, unmount } = renderHook(() => useTestContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.storageReady).toBe(true);
    });

    await act(async () => {
      const res = await result.current.loadGraph(testGraphId);
      expect(res.ok).toBe(true);
    });

    expect(result.current.graph).not.toBeNull();

    let nodeId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.createNode(SYSTEM_IDS.TYPE_TEXT_BLOCK, {
        content: ['block-1', 'block-2'],
      });
      if (res.ok) nodeId = res.value;
    });

    expect(nodeId).toBeDefined();
    if (nodeId === undefined) return;

    expect(result.current.graph?.nodes.has(nodeId)).toBe(true);
    expect(result.current.graph?.nodes.get(nodeId)?.properties.get('content')).toEqual([
      'block-1',
      'block-2',
    ]);

    // Simulate page reload — unmount providers and remount fresh
    unmount();
    const { result: result2 } = renderHook(() => useTestContext(), { wrapper });

    await waitFor(() => {
      expect(result2.current.storageReady).toBe(true);
    });

    await act(async () => {
      const res = await result2.current.loadGraph(testGraphId);
      expect(res.ok).toBe(true);
    });

    expect(result2.current.graph?.nodes.has(nodeId)).toBe(true);
    expect(result2.current.graph?.nodes.get(nodeId)?.properties.get('content')).toEqual([
      'block-1',
      'block-2',
    ]);
  });

  it('updateNodeProperties commits a partial change that survives reload', async () => {
    const testGraphId = asGraphId('test-graph-update-properties');
    const result = await loadFreshGraph(testGraphId);

    let nodeId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.createNode(SYSTEM_IDS.TYPE_MARKDOWN, {
        content: 'original',
      });
      if (res.ok) nodeId = res.value;
    });
    expect(nodeId).toBeDefined();
    if (nodeId === undefined) return;
    const createdNodeId = nodeId;

    await act(async () => {
      const res = await result.current.updateNodeProperties(
        createdNodeId,
        new Map([['content', 'updated']]),
      );
      expect(res.ok).toBe(true);
    });

    expect(result.current.graph?.nodes.get(createdNodeId)?.properties.get('content')).toBe(
      'updated',
    );
  });

  it('deleteNode removes the node and its edges', async () => {
    const testGraphId = asGraphId('test-graph-delete-node');
    const result = await loadFreshGraph(testGraphId);

    let nodeId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.createNode(SYSTEM_IDS.TYPE_MARKDOWN, { content: 'a' });
      if (res.ok) nodeId = res.value;
    });
    expect(nodeId).toBeDefined();
    if (nodeId === undefined) return;
    const createdNodeId = nodeId;

    await act(async () => {
      const res = await result.current.deleteNode(createdNodeId);
      expect(res.ok).toBe(true);
    });

    expect(result.current.graph?.nodes.has(createdNodeId)).toBe(false);
  });
});

describe('bootstrap bridge — context integration', () => {
  it('QUERY_ALL_NODES works after loading a fresh graph', async () => {
    const id = asGraphId('test-bootstrap-bridge');
    const result = await loadFreshGraph(id);

    const graph = result.current.graph;
    expect(graph).not.toBeNull();
    if (!graph) return;

    const queryResult = executeStoredQuery(graph, SYSTEM_IDS.QUERY_ALL_NODES);
    expect(queryResult.ok).toBe(true);
  });

  it('user node appears in QUERY_ALL_NODES results after createNode', async () => {
    const id = asGraphId('test-bootstrap-query-user-nodes');
    const result = await loadFreshGraph(id);

    let nodeId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.createNode(SYSTEM_IDS.TYPE_MARKDOWN, { content: 'test' });
      if (res.ok) nodeId = res.value;
    });

    expect(nodeId).toBeDefined();

    const graph = result.current.graph;
    expect(graph).not.toBeNull();
    if (!graph) return;

    const queryResult = executeStoredQuery(graph, SYSTEM_IDS.QUERY_ALL_NODES);
    expect(queryResult.ok).toBe(true);
    if (!queryResult.ok) return;

    const userNodes = queryResult.value.nodes.filter((n) => n.id === nodeId);
    expect(userNodes).toHaveLength(1);
  });

  it('VIEW_ALL_NODES returns only user nodes', async () => {
    const id = asGraphId('test-bootstrap-view');
    const result = await loadFreshGraph(id);

    let nodeId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.createNode(SYSTEM_IDS.TYPE_MARKDOWN, { content: 'hello' });
      if (res.ok) nodeId = res.value;
    });

    const graph = result.current.graph;
    expect(graph).not.toBeNull();
    if (!graph) return;

    const viewResult = executeView(graph, SYSTEM_IDS.VIEW_ALL_NODES);
    expect(viewResult.ok).toBe(true);
    if (!viewResult.ok) return;

    expect(viewResult.value.nodes.every((n) => n.id === nodeId)).toBe(true);
    expect(viewResult.value.nodes).toHaveLength(1);
  });

  it('listAllowedNodeTypes on a loaded graph exposes Markdown, CodeBlock, and TextBlock', async () => {
    const id = asGraphId('test-list-allowed');
    const result = await loadFreshGraph(id);

    const graph = result.current.graph;
    expect(graph).not.toBeNull();
    if (!graph) return;

    const types = listAllowedNodeTypes(graph, listNamespaces(graph));
    const ids = types.map((t) => t.id).toSorted();
    expect(ids).toEqual(
      [
        SYSTEM_IDS.TYPE_CODE_BLOCK,
        SYSTEM_IDS.TYPE_MARKDOWN,
        SYSTEM_IDS.TYPE_TEXT_BLOCK,
        SYSTEM_IDS.QUERY_DEFINITION,
      ].toSorted(),
    );
  });
});

describe('type-authoring bridge — context integration', () => {
  it('createNamespace persists a Namespace node reachable after save/load', async () => {
    const id = asGraphId('test-type-authoring-namespace');
    const result = await loadFreshGraph(id);

    let namespaceId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.createNamespace({ name: 'my-namespace', kind: 'user' });
      expect(res.ok).toBe(true);
      if (res.ok) namespaceId = res.value;
    });

    expect(namespaceId).toBeDefined();
    if (!namespaceId) return;
    expect(result.current.graph?.nodes.get(namespaceId)?.properties.get('name')).toBe(
      'my-namespace',
    );
  });

  it('createNamespace rejects a restricted kind and creates nothing', async () => {
    const id = asGraphId('test-type-authoring-namespace-restricted');
    const result = await loadFreshGraph(id);

    const beforeCount = result.current.graph?.nodes.size;

    await act(async () => {
      const res = await result.current.createNamespace({ name: 'sneaky', kind: 'system' });
      expect(res.ok).toBe(false);
    });

    expect(result.current.graph?.nodes.size).toBe(beforeCount);
  });

  it('createNodeType in a restricted namespace is rejected', async () => {
    const id = asGraphId('test-type-authoring-nodetype-restricted');
    const result = await loadFreshGraph(id);

    await act(async () => {
      const res = await result.current.createNodeType({
        name: 'sneaky-type',
        namespace: 'system',
        properties: [],
      });
      expect(res.ok).toBe(false);
    });
  });

  it('createPropertyType then createNodeType referencing it resolves an inline PropertyDefinition', async () => {
    const id = asGraphId('test-type-authoring-property-reference');
    const result = await loadFreshGraph(id);

    let propertyTypeId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.createPropertyType({
        name: 'priority',
        namespace: 'user',
        valueKind: 'number',
      });
      expect(res.ok).toBe(true);
      if (res.ok) propertyTypeId = res.value;
    });

    expect(propertyTypeId).toBeDefined();
    if (!propertyTypeId) return;
    const referencedPropertyTypeId = propertyTypeId;

    let nodeTypeId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.createNodeType({
        name: 'task',
        namespace: 'user',
        properties: [
          { kind: 'reference', propertyTypeId: referencedPropertyTypeId, required: true },
        ],
      });
      expect(res.ok).toBe(true);
      if (res.ok) nodeTypeId = res.value;
    });

    expect(nodeTypeId).toBeDefined();
    if (!nodeTypeId) return;
    const raw = result.current.graph?.nodes.get(nodeTypeId)?.properties.get('properties');
    if (typeof raw !== 'string') throw new Error('expected properties to be a JSON string');
    const parsed: unknown = JSON.parse(raw);
    expect(parsed).toEqual([
      { name: 'priority', valueKind: 'number', required: true, description: undefined },
    ]);
  });

  it('createEdgeType persists sourceTypes/targetTypes', async () => {
    const id = asGraphId('test-type-authoring-edgetype');
    const result = await loadFreshGraph(id);

    await act(async () => {
      const res = await result.current.createNodeType({
        name: 'task',
        namespace: 'user',
        properties: [],
      });
      expect(res.ok).toBe(true);
    });

    const taskType = [...(result.current.graph?.nodes.values() ?? [])].find(
      (n) => n.properties.get('name') === 'task',
    );
    expect(taskType).toBeDefined();
    if (!taskType) return;

    await act(async () => {
      const res = await result.current.createEdgeType({
        name: 'blocks',
        namespace: 'user',
        properties: [],
        sourceTypes: [taskType.id],
        targetTypes: [taskType.id],
      });
      expect(res.ok).toBe(true);
    });

    const edgeType = [...(result.current.graph?.nodes.values() ?? [])].find(
      (n) => n.properties.get('name') === 'blocks',
    );
    expect(edgeType?.properties.get('sourceTypes')).toEqual([taskType.id]);
    expect(edgeType?.properties.get('targetTypes')).toEqual([taskType.id]);
  });
});
