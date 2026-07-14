import { describe, it, expect } from 'bun:test';
import {
  createGraph,
  asGraphId,
  asNodeId,
  asTypeId,
  asEdgeId,
  asNamespace,
  unwrap,
  createInstant,
  SYSTEM_IDS,
  SYSTEM_EDGE_TYPES,
  SYSTEM_DEVICE_ID,
  addNode,
  addEdge,
} from '@canopy/graph';
import type { Node, Edge } from '@canopy/graph';
import { resolveViewDefinition } from '../src/view-resolution';

describe('View resolution engine', () => {
  it('resolves using a node-specific view override edge', () => {
    let graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    const nodeId = asNodeId('user:node:1');
    const typeId = asTypeId('user:nodetype:custom');
    const namespace = asNamespace('user');

    // 1. Create a ViewDefinition node
    const viewNode: Node = {
      id: asNodeId('user:view:override-target'),
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([
        ['name', 'Override View'],
        ['layout', 'list'],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addNode(graph, viewNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // 2. Create the target node
    const targetNode: Node = {
      id: nodeId,
      type: typeId,
      properties: new Map(),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addNode(graph, targetNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // 3. Create the VIEW_OVERRIDE edge
    const overrideEdge: Edge = {
      id: asEdgeId('user:edge:override'),
      type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
      source: nodeId,
      target: viewNode.id,
      properties: new Map(),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addEdge(graph, overrideEdge, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // Resolve view
    const result = resolveViewDefinition(graph, nodeId, typeId, namespace);
    expect(result.ok).toBe(true);
    expect(unwrap(result).id).toBe(viewNode.id);
  });

  it('resolves using the default-view setting from cascade', () => {
    let graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    const nodeId = asNodeId('user:node:1');
    const typeId = asTypeId('user:nodetype:custom');
    const namespace = asNamespace('user');

    // 1. Create a ViewDefinition node
    const viewNode: Node = {
      id: asNodeId('user:view:setting-target'),
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([
        ['name', 'Setting View'],
        ['layout', 'grid'],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addNode(graph, viewNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // 2. Create the target node
    const targetNode: Node = {
      id: nodeId,
      type: typeId,
      properties: new Map(),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addNode(graph, targetNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // 3. Create a UserSetting node scope='node' for default-view pointing to the viewNode.id
    const userSettingNode: Node = {
      id: asNodeId('user:setting:default-view-override'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', SYSTEM_IDS.SETTING_DEFAULT_VIEW],
        ['scopeType', 'node'],
        ['scopeTarget', nodeId],
        ['value', JSON.stringify(viewNode.id)],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addNode(graph, userSettingNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // Resolve view
    const result = resolveViewDefinition(graph, nodeId, typeId, namespace);
    expect(result.ok).toBe(true);
    expect(unwrap(result).id).toBe(viewNode.id);
  });

  it('resolves using a default_view edge from the node type definition node', () => {
    let graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    const nodeId = asNodeId('user:node:1');
    const typeId = asTypeId('user:nodetype:custom');
    const namespace = asNamespace('user');

    // 1. Create a ViewDefinition node
    const viewNode: Node = {
      id: asNodeId('user:view:type-default-target'),
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([
        ['name', 'Type Default View'],
        ['layout', 'board'],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addNode(graph, viewNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // 2. Create the Node Type definition node (using typeId as the ID)
    const typeDefNode: Node = {
      id: asNodeId(typeId),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: new Map([
        ['name', 'Custom Type Definition'],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addNode(graph, typeDefNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // 3. Create the target node
    const targetNode: Node = {
      id: nodeId,
      type: typeId,
      properties: new Map(),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addNode(graph, targetNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // 4. Create the DEFAULT_VIEW edge from typeDefNode to viewNode
    const defaultViewEdge: Edge = {
      id: asEdgeId('user:edge:default-view'),
      type: SYSTEM_EDGE_TYPES.DEFAULT_VIEW,
      source: typeDefNode.id,
      target: viewNode.id,
      properties: new Map(),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addEdge(graph, defaultViewEdge, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // Resolve view
    const result = resolveViewDefinition(graph, nodeId, typeId, namespace);
    expect(result.ok).toBe(true);
    expect(unwrap(result).id).toBe(viewNode.id);
  });

  it('returns a failed Result when no override or default exists', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));
    const nodeId = asNodeId('user:node:1');
    const typeId = asTypeId('user:nodetype:custom');
    const namespace = asNamespace('user');

    const result = resolveViewDefinition(graph, nodeId, typeId, namespace);
    expect(result.ok).toBe(false);
  });
});
