import { describe, it, expect } from 'bun:test';
import { createGraph } from './create-graph';
import {
  getGraphIndexes,
  buildGraphIndexes,
  incrementalUpdateIndexes,
  createIndexedReadModel,
} from './indexes';
import {
  asGraphId,
  asNodeId,
  asEdgeId,
  asTypeId,
  asInstant,
  createEventId,
  asDeviceId,
  createInstant,
  unwrap,
  SYSTEM_IDS,
  SYSTEM_EDGE_TYPES,
  type Node,
  type Edge,
  type Graph,
  type GraphEvent,
  type PropertyValue,
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
    const value = indexes.userSettings.get(key) as unknown as {
      readonly nested: string;
      readonly arr: readonly number[];
    };

    expect(value).toBeDefined();
    expect(value.nested).toBe('value');
    expect(value.arr).toEqual([1, 2, 3]);

    // Verify deep freezing
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.arr)).toBe(true);
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
    const valueA = indexes.userSettings.get('A:B\0C\0');
    const valueB = indexes.userSettings.get('A\0B:C\0');

    expect(valueA).toBe('valA');
    expect(valueB).toBe('valB');
  });

  it('resolves multiple view override edges deterministically using newest timestamp and lexicographical ID', () => {
    let graph = unwrap(createGraph(graphId, 'Test'));

    const sourceNodeId = asNodeId('my-content-node');
    const viewDefinition1: Node = {
      id: asNodeId('view-def-1'),
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };
    const viewDefinition2: Node = {
      id: asNodeId('view-def-2'),
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };

    graph = {
      ...graph,
      nodes: new Map([
        ...graph.nodes,
        [viewDefinition1.id, viewDefinition1],
        [viewDefinition2.id, viewDefinition2],
      ]),
    };

    // Edge 1: older
    const edge1: Edge = {
      id: asEdgeId('edge-1'),
      type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
      source: sourceNodeId,
      target: viewDefinition1.id,
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
      target: viewDefinition2.id,
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
    expect(resolved?.id).toBe(viewDefinition2.id); // Newer wins
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

describe('read-model indexes (type / adjacency / property-equality)', () => {
  const graphId = asGraphId('read-model-test-graph');
  const deviceId = asDeviceId('00000000-0000-0000-0000-000000000002');
  const taskType = asTypeId('content:node-type:task');
  const projectType = asTypeId('content:node-type:project');
  const belongsToType = asTypeId('content:edge-type:belongs-to');
  const tagType = asTypeId('content:edge-type:tagged-with');

  function makeNode(
    id: string,
    type: ReturnType<typeof asTypeId>,
    properties: ReadonlyMap<string, PropertyValue>,
  ): Node {
    return {
      id: asNodeId(id),
      type,
      properties,
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };
  }

  function makeEdge(
    id: string,
    type: ReturnType<typeof asTypeId>,
    source: string,
    target: string,
  ): Edge {
    return {
      id: asEdgeId(id),
      type,
      source: asNodeId(source),
      target: asNodeId(target),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };
  }

  function graphWithFixture(): Graph {
    const base = unwrap(createGraph(graphId, 'Test'));
    const task1 = makeNode(
      'task-1',
      taskType,
      new Map<string, PropertyValue>([
        ['status', 'open'],
        ['priority', 5],
      ]),
    );
    const task2 = makeNode(
      'task-2',
      taskType,
      new Map<string, PropertyValue>([
        ['status', 'done'],
        ['priority', 5],
      ]),
    );
    const project1 = makeNode(
      'project-1',
      projectType,
      new Map<string, PropertyValue>([['status', 'open']]),
    );
    const edge1 = makeEdge('edge-1', belongsToType, 'task-1', 'project-1');
    const edge2 = makeEdge('edge-2', belongsToType, 'task-2', 'project-1');
    const edge3 = makeEdge('edge-3', tagType, 'task-1', 'project-1');

    return {
      ...base,
      nodes: new Map([
        ...base.nodes,
        [task1.id, task1],
        [task2.id, task2],
        [project1.id, project1],
      ]),
      edges: new Map([...base.edges, [edge1.id, edge1], [edge2.id, edge2], [edge3.id, edge3]]),
    };
  }

  it('buildGraphIndexes populates typeIndex per node type', () => {
    const indexes = buildGraphIndexes(graphWithFixture());
    expect(indexes.typeIndex.get(taskType)).toEqual(
      new Set([asNodeId('task-1'), asNodeId('task-2')]),
    );
    expect(indexes.typeIndex.get(projectType)).toEqual(new Set([asNodeId('project-1')]));
  });

  it('buildGraphIndexes populates adjacencyOut and adjacencyIn bucketed by edge type', () => {
    const indexes = buildGraphIndexes(graphWithFixture());

    const task1Out = indexes.adjacencyOut.get(asNodeId('task-1'));
    expect(task1Out?.get(belongsToType)).toEqual(new Set([asNodeId('project-1')]));
    expect(task1Out?.get(tagType)).toEqual(new Set([asNodeId('project-1')]));

    const project1In = indexes.adjacencyIn.get(asNodeId('project-1'));
    expect(project1In?.get(belongsToType)).toEqual(
      new Set([asNodeId('task-1'), asNodeId('task-2')]),
    );
  });

  it('buildGraphIndexes populates propertyEquality for scalar properties, skipping arrays', () => {
    const fixture = graphWithFixture();
    const taggedNode = makeNode(
      'tagged-node',
      taskType,
      new Map<string, PropertyValue>([['tags', ['a', 'b']]]),
    );
    const withArrayProperty: Graph = {
      ...fixture,
      nodes: new Map([...fixture.nodes, [taggedNode.id, taggedNode]]),
    };

    const indexes = buildGraphIndexes(fixture);
    const statusOpen = indexes.propertyEquality.get('status')?.get('string:open');
    expect(statusOpen).toEqual(new Set([asNodeId('task-1'), asNodeId('project-1')]));

    const arrayIndexes = buildGraphIndexes(withArrayProperty);
    expect(arrayIndexes.propertyEquality.get('tags')).toBeUndefined();
  });

  it('propertyEquality distinguishes values of different runtime types', () => {
    const fixture = graphWithFixture();
    const numberNode = makeNode(
      'n-number',
      taskType,
      new Map<string, PropertyValue>([['priority', 1]]),
    );
    const stringNode = makeNode(
      'n-string',
      taskType,
      new Map<string, PropertyValue>([['priority', '1']]),
    );
    const graph: Graph = {
      ...fixture,
      nodes: new Map([...fixture.nodes, [numberNode.id, numberNode], [stringNode.id, stringNode]]),
    };

    const indexes = buildGraphIndexes(graph);
    expect(indexes.propertyEquality.get('priority')?.get('number:1')).toEqual(
      new Set([asNodeId('n-number')]),
    );
    expect(indexes.propertyEquality.get('priority')?.get('string:1')).toEqual(
      new Set([asNodeId('n-string')]),
    );
  });

  describe('createIndexedReadModel', () => {
    it('typedNodeIds returns node IDs of the given type, empty set for unknown type', () => {
      const readModel = createIndexedReadModel(graphWithFixture());
      expect(new Set(readModel.typedNodeIds(taskType))).toEqual(
        new Set([asNodeId('task-1'), asNodeId('task-2')]),
      );
      expect(new Set(readModel.typedNodeIds(asTypeId('nonexistent')))).toEqual(new Set());
    });

    it('neighbours resolves out/in/both direction, with and without edgeType narrowing', () => {
      const readModel = createIndexedReadModel(graphWithFixture());

      expect(new Set(readModel.neighbours(asNodeId('task-1'), belongsToType, 'out'))).toEqual(
        new Set([asNodeId('project-1')]),
      );
      expect(new Set(readModel.neighbours(asNodeId('task-1'), undefined, 'out'))).toEqual(
        new Set([asNodeId('project-1')]), // both belongsTo and tagged-with point at project-1
      );
      expect(new Set(readModel.neighbours(asNodeId('project-1'), belongsToType, 'in'))).toEqual(
        new Set([asNodeId('task-1'), asNodeId('task-2')]),
      );
      expect(new Set(readModel.neighbours(asNodeId('project-1'), belongsToType, 'both'))).toEqual(
        new Set([asNodeId('task-1'), asNodeId('task-2')]), // project-1 has no outbound belongsTo edges
      );
      expect(
        new Set(readModel.neighbours(asNodeId('task-1'), asTypeId('nonexistent'), 'out')),
      ).toEqual(new Set());
    });

    it('nodesWhereEquals returns matches, optionally narrowed by type, empty for arrays', () => {
      const readModel = createIndexedReadModel(graphWithFixture());

      expect(new Set(readModel.nodesWhereEquals('status', 'open'))).toEqual(
        new Set([asNodeId('task-1'), asNodeId('project-1')]),
      );
      expect(new Set(readModel.nodesWhereEquals('status', 'open', taskType))).toEqual(
        new Set([asNodeId('task-1')]),
      );
      expect(new Set(readModel.nodesWhereEquals('status', 'nonexistent-value'))).toEqual(new Set());
      expect(new Set(readModel.nodesWhereEquals('tags', ['a', 'b']))).toEqual(new Set());
    });
  });
});
