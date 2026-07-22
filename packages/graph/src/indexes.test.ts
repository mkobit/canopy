import { describe, it, expect } from 'bun:test';
import { createGraph } from './create-graph';
import { getGraphIndexes, buildGraphIndexes, incrementalUpdateIndexes } from './indexes';
import {
  asGraphId,
  asNodeId,
  asEdgeId,
  asInstant,
  createEventId,
  asDeviceId,
  createInstant,
  unwrap,
  SYSTEM_IDS,
  SYSTEM_EDGE_TYPES,
  type Node,
  type Edge,
  type GraphEvent,
} from '@canopy/graph';

describe('GraphIndexes', () => {
  const graphId = asGraphId('test-graph-id');
  const deviceId = asDeviceId('00000000-0000-0000-0000-000000000001');

  it('buildGraphIndexes constructs empty indexes for a fresh graph', () => {
    const graph = unwrap(createGraph(graphId, 'Test'));
    const indexes = buildGraphIndexes(graph);

    expect(indexes.settingsSchemas.size).toBe(2); // default view and display density from bootstrap
    expect(indexes.userSettings.size).toBe(0);
    expect(indexes.viewOverrides.size).toBe(0);
    expect(indexes.defaultViews.size).toBe(3); // bootstrapped defaults (text, code, markdown)
  });

  it('indexes SettingsSchema nodes correctly', () => {
    let graph = unwrap(createGraph(graphId, 'Test'));

    const node: Node = {
      id: asNodeId('custom-schema'),
      type: SYSTEM_IDS.SETTINGS_SCHEMA,
      properties: new Map([
        ['key', 'my-custom-key'],
        ['name', 'Custom Schema'],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: deviceId,
      },
    };

    graph = {
      ...graph,
      nodes: new Map([...graph.nodes, [node.id, node]]),
    };

    const indexes = buildGraphIndexes(graph);
    const resolved = indexes.settingsSchemas.get('my-custom-key');
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe(node.id);
  });

  it('indexes UserSetting nodes with JSON-parsed deeply frozen values', () => {
    let graph = unwrap(createGraph(graphId, 'Test'));

    const userSettingNode: Node = {
      id: asNodeId('setting-1'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', 'custom-schema'],
        ['scopeType', 'node'],
        ['scopeTarget', 'target-node-1'],
        ['value', JSON.stringify({ nested: 'value', arr: [1, 2, 3] })],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: deviceId,
      },
    };

    graph = {
      ...graph,
      nodes: new Map([...graph.nodes, [userSettingNode.id, userSettingNode]]),
    };

    const indexes = buildGraphIndexes(graph);
    // Compound key: schemaId\0scopeType\0scopeTarget
    const key = `custom-schema\0node\0target-node-1`;
    const val = indexes.userSettings.get(key) as unknown as {
      readonly nested: string;
      readonly arr: readonly number[];
    };

    expect(val).toBeDefined();
    expect(val.nested).toBe('value');
    expect(val.arr).toEqual([1, 2, 3]);

    // Verify deep freezing
    expect(Object.isFrozen(val)).toBe(true);
    expect(Object.isFrozen(val.arr)).toBe(true);
  });

  it('prevents key collisions with null-byte compound keys', () => {
    let graph = unwrap(createGraph(graphId, 'Test'));

    // Node A: schemaId="A:B", scopeType="C"
    const settingA: Node = {
      id: asNodeId('setting-a'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', 'A:B'],
        ['scopeType', 'C'],
        ['value', '"valA"'],
      ]),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };

    // Node B: schemaId="A", scopeType="B:C"
    const settingB: Node = {
      id: asNodeId('setting-b'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', 'A'],
        ['scopeType', 'B:C'],
        ['value', '"valB"'],
      ]),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };

    graph = {
      ...graph,
      nodes: new Map([...graph.nodes, [settingA.id, settingA], [settingB.id, settingB]]),
    };

    const indexes = buildGraphIndexes(graph);
    const valA = indexes.userSettings.get('A:B\0C\0');
    const valB = indexes.userSettings.get('A\0B:C\0');

    expect(valA).toBe('valA');
    expect(valB).toBe('valB');
  });

  it('resolves multiple view override edges deterministically using newest timestamp and lexicographical ID', () => {
    let graph = unwrap(createGraph(graphId, 'Test'));

    const sourceNodeId = asNodeId('my-content-node');
    const viewDef1: Node = {
      id: asNodeId('view-def-1'),
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };
    const viewDef2: Node = {
      id: asNodeId('view-def-2'),
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };

    graph = {
      ...graph,
      nodes: new Map([...graph.nodes, [viewDef1.id, viewDef1], [viewDef2.id, viewDef2]]),
    };

    // Edge 1: older
    const edge1: Edge = {
      id: asEdgeId('edge-1'),
      type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
      source: sourceNodeId,
      target: viewDef1.id,
      properties: new Map(),
      metadata: {
        created: asInstant('2026-07-21T10:00:00Z'),
        modified: asInstant('2026-07-21T10:00:00Z'),
        modifiedBy: deviceId,
      },
    };

    // Edge 2: newer
    const edge2: Edge = {
      id: asEdgeId('edge-2'),
      type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
      source: sourceNodeId,
      target: viewDef2.id,
      properties: new Map(),
      metadata: {
        created: asInstant('2026-07-21T11:00:00Z'),
        modified: asInstant('2026-07-21T11:00:00Z'),
        modifiedBy: deviceId,
      },
    };

    graph = {
      ...graph,
      edges: new Map([...graph.edges, [edge1.id, edge1], [edge2.id, edge2]]),
    };

    const indexes = buildGraphIndexes(graph);
    const resolved = indexes.viewOverrides.get(sourceNodeId);
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe(viewDef2.id); // Newer wins
  });

  it('getGraphIndexes caches index reference on the graph object', () => {
    const graph = unwrap(createGraph(graphId, 'Test'));
    const index1 = getGraphIndexes(graph);
    const index2 = getGraphIndexes(graph);

    expect(index1).toBe(index2); // Exact same reference
  });

  it('incrementalUpdateIndexes reuses index reference for standard content events', () => {
    const graph = unwrap(createGraph(graphId, 'Test'));
    const indexes = getGraphIndexes(graph);

    // Event: NodePropertiesUpdated on a normal node (not settings/view config)
    const event: GraphEvent = {
      eventId: createEventId(),
      type: 'NodePropertiesUpdated',
      id: asNodeId('my-content-node'),
      changes: new Map([['content', 'hello']]),
      timestamp: createInstant(),
      deviceId,
    };

    const nextIndexes = incrementalUpdateIndexes(indexes, event, graph);
    expect(nextIndexes).toBe(indexes); // Reused index reference
  });

  it('incrementalUpdateIndexes rebuilds indexes when configuration event is processed', () => {
    const graph = unwrap(createGraph(graphId, 'Test'));
    const indexes = getGraphIndexes(graph);

    // Event: NodeCreated for a settings schema node
    const event: GraphEvent = {
      eventId: createEventId(),
      type: 'NodeCreated',
      id: asNodeId('system:nodetype:settings-schema'),
      nodeType: SYSTEM_IDS.SETTINGS_SCHEMA,
      properties: new Map([['key', 'new-schema-key']]),
      timestamp: createInstant(),
      deviceId,
    };

    const nextIndexes = incrementalUpdateIndexes(indexes, event, graph);
    expect(nextIndexes).not.toBe(indexes); // Rebuilt!
  });
});
