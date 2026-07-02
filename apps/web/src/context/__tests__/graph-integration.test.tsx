import { describe, it, expect } from 'bun:test';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { StorageProvider, useStorage } from '../storage-context';
import { GraphProvider, useGraph } from '../graph-context';
import { asGraphId, SYSTEM_IDS, createGraph } from '@canopy/graph';
import { createSyncEngine } from '@canopy/sync';
import { executeStoredQuery, executeView } from '@canopy/queries';
import { Temporal } from 'temporal-polyfill';
import type { NodeId } from '@canopy/graph';
import type { ReactNode } from 'react';
import { listAllowedNodeTypes } from '../../utils/node-types';

function useTestContext() {
  const { storage, isLoading: storageLoading } = useStorage();
  const graphCtx = useGraph();
  return { storageReady: !storageLoading && storage !== null, storage, ...graphCtx };
}

const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <StorageProvider>
    <GraphProvider>{children}</GraphProvider>
  </StorageProvider>
);

describe('graph round-trip', () => {
  it('persists a node through save and load', async () => {
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

    // Create a node — createNode auto-saves
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

  it('persists a TextBlock node with list content through save and load', async () => {
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
});

describe('bootstrap bridge — context integration', () => {
  it('QUERY_ALL_NODES works after loading a bootstrapped graph', async () => {
    const id = asGraphId('test-bootstrap-bridge');
    const { result } = renderHook(() => useTestContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.storageReady).toBe(true);
    });

    // Simulate HomePage.handleCreateGraph bootstrap bridge
    const graphResult = createGraph(id, 'Bootstrap Test');
    expect(graphResult.ok).toBe(true);
    if (!graphResult.ok) return;

    const engine = createSyncEngine({});
    [...graphResult.value.nodes.values()].map((node) =>
      engine.store.addNode({ id: node.id, type: node.type, properties: node.properties }),
    );

    await act(async () => {
      const saveResult = await result.current.storage?.save(id, engine.getSnapshot(), {
        id,
        name: 'Bootstrap Test',
        createdAt: Temporal.Now.instant().toString(),
        updatedAt: Temporal.Now.instant().toString(),
      });
      expect(saveResult?.ok).toBe(true);
    });

    await act(async () => {
      const loadResult = await result.current.loadGraph(id);
      expect(loadResult.ok).toBe(true);
    });

    const graph = result.current.graph;
    expect(graph).not.toBeNull();
    if (!graph) return;

    const queryResult = executeStoredQuery(graph, SYSTEM_IDS.QUERY_ALL_NODES);
    expect(queryResult.ok).toBe(true);
  });

  it('user node appears in QUERY_ALL_NODES results after createNode', async () => {
    const id = asGraphId('test-bootstrap-query-user-nodes');
    const { result } = renderHook(() => useTestContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.storageReady).toBe(true);
    });

    const graphResult = createGraph(id, 'Query Test');
    expect(graphResult.ok).toBe(true);
    if (!graphResult.ok) return;

    const engine = createSyncEngine({});
    [...graphResult.value.nodes.values()].map((node) =>
      engine.store.addNode({ id: node.id, type: node.type, properties: node.properties }),
    );

    await act(async () => {
      await result.current.storage?.save(id, engine.getSnapshot(), {
        id,
        name: 'Query Test',
        createdAt: Temporal.Now.instant().toString(),
        updatedAt: Temporal.Now.instant().toString(),
      });
    });

    await act(async () => {
      await result.current.loadGraph(id);
    });

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
    const { result } = renderHook(() => useTestContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.storageReady).toBe(true);
    });

    const graphResult = createGraph(id, 'View Test');
    expect(graphResult.ok).toBe(true);
    if (!graphResult.ok) return;

    const engine = createSyncEngine({});
    [...graphResult.value.nodes.values()].map((node) =>
      engine.store.addNode({ id: node.id, type: node.type, properties: node.properties }),
    );

    await act(async () => {
      await result.current.storage?.save(id, engine.getSnapshot(), {
        id,
        name: 'View Test',
        createdAt: Temporal.Now.instant().toString(),
        updatedAt: Temporal.Now.instant().toString(),
      });
    });

    await act(async () => {
      await result.current.loadGraph(id);
    });

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
    const { result } = renderHook(() => useTestContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.storageReady).toBe(true);
    });

    const graphResult = createGraph(id, 'Allowed Types Test');
    expect(graphResult.ok).toBe(true);
    if (!graphResult.ok) return;

    const engine = createSyncEngine({});
    [...graphResult.value.nodes.values()].map((node) =>
      engine.store.addNode({ id: node.id, type: node.type, properties: node.properties }),
    );

    await act(async () => {
      await result.current.storage?.save(id, engine.getSnapshot(), {
        id,
        name: 'Allowed Types Test',
        createdAt: Temporal.Now.instant().toString(),
        updatedAt: Temporal.Now.instant().toString(),
      });
    });

    await act(async () => {
      await result.current.loadGraph(id);
    });

    const graph = result.current.graph;
    expect(graph).not.toBeNull();
    if (!graph) return;

    const types = listAllowedNodeTypes(graph);
    const ids = types.map((t) => t.id).toSorted();
    expect(ids).toEqual(
      [SYSTEM_IDS.TYPE_CODE_BLOCK, SYSTEM_IDS.TYPE_MARKDOWN, SYSTEM_IDS.TYPE_TEXT_BLOCK].toSorted(),
    );
  });
});

async function loadBootstrappedGraph(id: ReturnType<typeof asGraphId>, name: string) {
  const { result } = renderHook(() => useTestContext(), { wrapper });

  await waitFor(() => {
    expect(result.current.storageReady).toBe(true);
  });

  const graphResult = createGraph(id, name);
  expect(graphResult.ok).toBe(true);
  if (!graphResult.ok) throw graphResult.error;

  const engine = createSyncEngine({});
  [...graphResult.value.nodes.values()].map((node) =>
    engine.store.addNode({ id: node.id, type: node.type, properties: node.properties }),
  );

  await act(async () => {
    await result.current.storage?.save(id, engine.getSnapshot(), {
      id,
      name,
      createdAt: Temporal.Now.instant().toString(),
      updatedAt: Temporal.Now.instant().toString(),
    });
  });

  await act(async () => {
    await result.current.loadGraph(id);
  });

  return result;
}

describe('type-authoring bridge — context integration', () => {
  it('createNamespace persists a Namespace node reachable after save/load', async () => {
    const id = asGraphId('test-type-authoring-namespace');
    const result = await loadBootstrappedGraph(id, 'Namespace Test');

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
    const result = await loadBootstrappedGraph(id, 'Namespace Restricted Test');

    const beforeCount = result.current.graph?.nodes.size;

    await act(async () => {
      const res = await result.current.createNamespace({ name: 'sneaky', kind: 'system' });
      expect(res.ok).toBe(false);
    });

    expect(result.current.graph?.nodes.size).toBe(beforeCount);
  });

  it('createNodeType in a restricted namespace is rejected', async () => {
    const id = asGraphId('test-type-authoring-nodetype-restricted');
    const result = await loadBootstrappedGraph(id, 'NodeType Restricted Test');

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
    const result = await loadBootstrappedGraph(id, 'Property Reference Test');

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
    const result = await loadBootstrappedGraph(id, 'EdgeType Test');

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
