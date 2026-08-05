import { describe, it, expect } from 'bun:test';
import { createGraph } from './create-graph';
import {
  getGraphIndexes,
  buildGraphIndexes,
  incrementalUpdateIndexes,
  createIndexedReadModel,
  verifyIndexes,
} from './indexes';
import { applyEvent } from './projection';
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
  type GraphIndexes,
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

    const nextIndexes = incrementalUpdateIndexes(indexes, event, graph, graph);
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

    const nextIndexes = incrementalUpdateIndexes(indexes, event, graph, graph);
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
    expect(task1Out?.get(belongsToType)).toEqual(new Map([[asNodeId('project-1'), 1]]));
    expect(task1Out?.get(tagType)).toEqual(new Map([[asNodeId('project-1'), 1]]));

    const project1In = indexes.adjacencyIn.get(asNodeId('project-1'));
    expect(project1In?.get(belongsToType)).toEqual(
      new Map([
        [asNodeId('task-1'), 1],
        [asNodeId('task-2'), 1],
      ]),
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

function applyOk(graph: Graph, event: GraphEvent): Graph {
  const result = applyEvent(graph, event);
  if (!result.ok) throw result.error;
  return result.value;
}

describe('incrementalUpdateIndexes O(delta) read-model maintenance', () => {
  const graphId = asGraphId('incremental-read-model-test-graph');
  const deviceId = asDeviceId('00000000-0000-0000-0000-000000000003');
  const taskType = asTypeId('content:node-type:task');
  const projectType = asTypeId('content:node-type:project');
  const belongsToType = asTypeId('content:edge-type:belongs-to');

  function seededGraph(): Graph {
    const base = unwrap(createGraph(graphId, 'Test'));
    const nodeA: Node = {
      id: asNodeId('node-a'),
      type: taskType,
      properties: new Map<string, PropertyValue>([['status', 'open']]),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };
    const nodeB: Node = {
      id: asNodeId('node-b'),
      type: projectType,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };
    const edgeAB: Edge = {
      id: asEdgeId('edge-a-b'),
      type: belongsToType,
      source: nodeA.id,
      target: nodeB.id,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };
    const graph: Graph = {
      ...base,
      nodes: new Map([...base.nodes, [nodeA.id, nodeA], [nodeB.id, nodeB]]),
      edges: new Map([...base.edges, [edgeAB.id, edgeAB]]),
    };
    getGraphIndexes(graph); // seed graph._indexes so incrementalUpdateIndexes actually maintains it
    return graph;
  }

  it('NodeCreated adds to typeIndex/propertyEquality without rebuilding unrelated buckets', () => {
    const graph = seededGraph();
    const previousTaskBucket = graph._indexes?.typeIndex.get(taskType);

    const nextGraph = applyOk(graph, {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: asNodeId('node-c'),
      nodeType: taskType,
      properties: new Map<string, PropertyValue>([['status', 'done']]),
      timestamp: createInstant(),
      deviceId,
    });

    expect(nextGraph._indexes?.typeIndex.get(taskType)?.has(asNodeId('node-c'))).toBe(true);
    expect(nextGraph._indexes?.propertyEquality.get('status')?.get('string:done')).toEqual(
      new Set([asNodeId('node-c')]),
    );
    // Unrelated bucket (node-b, project type) untouched -- proves O(delta), not a full rebuild.
    expect(nextGraph._indexes?.typeIndex.get(projectType)).toBe(
      graph._indexes?.typeIndex.get(projectType),
    );
    // The bucket node-c was ADDED to is necessarily a new Set (copy-on-write), but it must not be
    // the exact same reference as before the addition -- sanity check the copy actually happened.
    expect(nextGraph._indexes?.typeIndex.get(taskType)).not.toBe(previousTaskBucket);
  });

  it('NodeDeleted removes from typeIndex/propertyEquality and cascades adjacency cleanup', () => {
    const graph = seededGraph();

    const nextGraph = applyOk(graph, {
      type: 'NodeDeleted',
      eventId: createEventId(),
      id: asNodeId('node-a'),
      timestamp: createInstant(),
      deviceId,
    });

    // node-a was the only task-typed node, so the whole bucket is cleaned up, not just emptied.
    expect(Boolean(nextGraph._indexes?.typeIndex.get(taskType)?.has(asNodeId('node-a')))).toBe(
      false,
    );
    expect(
      nextGraph._indexes?.propertyEquality
        .get('status')
        ?.get('string:open')
        ?.has(asNodeId('node-a')),
    ).toBeFalsy();
    // Cascade: the edge node-a --belongsTo--> node-b is gone from both adjacency directions.
    expect(nextGraph._indexes?.adjacencyOut.has(asNodeId('node-a'))).toBe(false);
    expect(
      nextGraph._indexes?.adjacencyIn
        .get(asNodeId('node-b'))
        ?.get(belongsToType)
        ?.has(asNodeId('node-a')),
    ).toBeFalsy();
  });

  it('parallel edges to the same neighbour: deleting one leaves the other contributing the adjacency', () => {
    const graph = seededGraph();

    // A second belongsTo edge from node-a to node-b, parallel to the seeded edge-a-b.
    const withParallelEdge = applyOk(graph, {
      type: 'EdgeCreated',
      eventId: createEventId(),
      id: asEdgeId('edge-a-b-2'),
      edgeType: belongsToType,
      source: asNodeId('node-a'),
      target: asNodeId('node-b'),
      properties: new Map(),
      timestamp: createInstant(),
      deviceId,
    });
    expect(
      withParallelEdge._indexes?.adjacencyOut
        .get(asNodeId('node-a'))
        ?.get(belongsToType)
        ?.get(asNodeId('node-b')),
    ).toBe(2);

    // Deleting only the ORIGINAL edge must not remove node-b as a neighbour -- edge-a-b-2 still connects them.
    const afterDeletingOne = applyOk(withParallelEdge, {
      type: 'EdgeDeleted',
      eventId: createEventId(),
      id: asEdgeId('edge-a-b'),
      timestamp: createInstant(),
      deviceId,
    });
    expect(
      afterDeletingOne._indexes?.adjacencyOut
        .get(asNodeId('node-a'))
        ?.get(belongsToType)
        ?.get(asNodeId('node-b')),
    ).toBe(1);
    expect(verifyIndexes(afterDeletingOne).ok).toBe(true);
  });

  it('EdgeCreated adds adjacency entries in both directions', () => {
    const graph = seededGraph();
    const nodeC: Node = {
      id: asNodeId('node-c'),
      type: taskType,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    };
    const graphWithC: Graph = { ...graph, nodes: new Map([...graph.nodes, [nodeC.id, nodeC]]) };

    const nextGraph = applyOk(graphWithC, {
      type: 'EdgeCreated',
      eventId: createEventId(),
      id: asEdgeId('edge-c-b'),
      edgeType: belongsToType,
      source: nodeC.id,
      target: asNodeId('node-b'),
      properties: new Map(),
      timestamp: createInstant(),
      deviceId,
    });

    expect(nextGraph._indexes?.adjacencyOut.get(nodeC.id)?.get(belongsToType)).toEqual(
      new Map([[asNodeId('node-b'), 1]]),
    );
    expect(nextGraph._indexes?.adjacencyIn.get(asNodeId('node-b'))?.get(belongsToType)).toEqual(
      new Map([
        [asNodeId('node-a'), 1],
        [nodeC.id, 1],
      ]),
    );
  });

  it('EdgeDeleted removes adjacency entries in both directions', () => {
    const graph = seededGraph();

    const nextGraph = applyOk(graph, {
      type: 'EdgeDeleted',
      eventId: createEventId(),
      id: asEdgeId('edge-a-b'),
      timestamp: createInstant(),
      deviceId,
    });

    expect(
      nextGraph._indexes?.adjacencyOut.get(asNodeId('node-a'))?.get(belongsToType),
    ).toBeUndefined();
    expect(
      nextGraph._indexes?.adjacencyIn.get(asNodeId('node-b'))?.get(belongsToType),
    ).toBeUndefined();
  });

  it('NodePropertiesUpdated moves the property-equality bucket from old value to new value', () => {
    const graph = seededGraph();

    const nextGraph = applyOk(graph, {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id: asNodeId('node-a'),
      changes: new Map<string, PropertyValue>([['status', 'done']]),
      timestamp: createInstant(),
      deviceId,
    });

    expect(
      nextGraph._indexes?.propertyEquality
        .get('status')
        ?.get('string:open')
        ?.has(asNodeId('node-a')),
    ).toBeFalsy();
    expect(nextGraph._indexes?.propertyEquality.get('status')?.get('string:done')).toEqual(
      new Set([asNodeId('node-a')]),
    );
  });

  it('a no-op event (a losing LWW update) leaves indexes unchanged by reference', () => {
    const graph = seededGraph();

    // Timestamp far in the past always loses lwwWins against node-a's real-time `modified`.
    const nextGraph = applyOk(graph, {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id: asNodeId('node-a'),
      changes: new Map<string, PropertyValue>([['status', 'done']]),
      timestamp: asInstant('2020-01-01T00:00:00Z'),
      deviceId,
    });

    expect(nextGraph._indexes).toBe(graph._indexes);
  });

  it('verifyIndexes agrees when incrementally-maintained indexes match a from-scratch rebuild', () => {
    const graph = seededGraph();
    const nextGraph = applyOk(graph, {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: asNodeId('node-c'),
      nodeType: taskType,
      properties: new Map<string, PropertyValue>([['status', 'done']]),
      timestamp: createInstant(),
      deviceId,
    });

    expect(verifyIndexes(nextGraph).ok).toBe(true);
  });

  it('verifyIndexes reports an error when indexes have been corrupted', () => {
    const graph = seededGraph();
    const corruptedIndexes: GraphIndexes = {
      ...(graph._indexes as GraphIndexes),
      typeIndex: new Map(), // wipe the type index -- clearly diverges from a from-scratch rebuild
    };
    const corruptedGraph: Graph = { ...graph, _indexes: corruptedIndexes };

    const result = verifyIndexes(corruptedGraph);
    expect(result.ok).toBe(false);
  });
});

describe('index maintenance cost regression (delta, not graph size)', () => {
  const deviceId = asDeviceId('00000000-0000-0000-0000-000000000004');

  /**
   * Builds a graph with `count` distinct node TYPES (one node each) and `count` distinct source
   * nodes each with their own edge-type bucket to a shared hub -- so `typeIndex`/`adjacencyOut`/
   * `adjacencyIn`/`propertyEquality` each have `count` independent top-level buckets to prove
   * untouched.
   */
  function buildManyBucketGraph(count: number): Graph {
    const base = unwrap(createGraph(asGraphId(`bucket-test-${count}`), 'Test'));
    const hubId = asNodeId(`hub-${count}`);
    const nodes = new Map(base.nodes);
    nodes.set(hubId, {
      id: hubId,
      type: asTypeId(`content:node-type:hub`),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
    });
    const edges = new Map(base.edges);
    for (let index = 0; index < count; index += 1) {
      const nodeId = asNodeId(`bucket-node-${count}-${index}`);
      nodes.set(nodeId, {
        id: nodeId,
        type: asTypeId(`content:node-type:bucket-${index}`), // own type -> own typeIndex bucket
        properties: new Map<string, PropertyValue>([[`prop${index}`, `v${index}`]]), // own propertyEquality bucket
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
      });
      const edgeId = asEdgeId(`bucket-edge-${count}-${index}`);
      edges.set(edgeId, {
        id: edgeId,
        type: asTypeId(`content:edge-type:bucket-${index}`), // own edge type -> own adjacency bucket
        source: nodeId,
        target: hubId,
        properties: new Map(),
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
      });
    }
    const graph: Graph = { ...base, nodes, edges };
    getGraphIndexes(graph); // seed _indexes so the probe event is maintained incrementally
    return graph;
  }

  it('adding one node leaves every unrelated bucket reference-identical, regardless of graph size', () => {
    for (const count of [50, 5000]) {
      const graph = buildManyBucketGraph(count);
      const before = graph._indexes as GraphIndexes;

      const nextGraph = applyOk(graph, {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: asNodeId(`probe-${count}`),
        nodeType: asTypeId('content:node-type:probe'),
        properties: new Map<string, PropertyValue>([['probeProp', 'probeValue']]),
        timestamp: createInstant(),
        deviceId,
      });
      const after = nextGraph._indexes as GraphIndexes;

      // Deterministic, environment-independent proof of O(delta): if maintenance had rebuilt or
      // rescanned the whole index (an O(V) regression), every bucket below would be a fresh
      // object; a true O(delta) update leaves every bucket it didn't touch as the exact same
      // reference. This holds identically at 50 and 5000 buckets -- unlike a timing-based
      // assertion, it can't be flaky under CI/parallel-test-suite load.
      for (let index = 0; index < count; index += 1) {
        const type = asTypeId(`content:node-type:bucket-${index}`);
        expect(after.typeIndex.get(type)).toBe(before.typeIndex.get(type));

        const property = `prop${index}`;
        expect(after.propertyEquality.get(property)).toBe(before.propertyEquality.get(property));

        const nodeId = asNodeId(`bucket-node-${count}-${index}`);
        expect(after.adjacencyOut.get(nodeId)).toBe(before.adjacencyOut.get(nodeId));
      }
      // The new node's own type/property buckets are, correctly, new (the one thing that changed).
      expect(after.typeIndex.get(asTypeId('content:node-type:probe'))).not.toBe(
        before.typeIndex.get(asTypeId('content:node-type:probe')),
      );
    }
  });
});
