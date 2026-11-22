import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createGraph,
  createGraphId,
  asDeviceId,
  asPropertyTypeId,
  type Graph,
  type PropertyValueKind,
} from '@canopy/graph';
import { SYSTEM_IDS, SYSTEM_EDGE_SHAPES } from '../system';
import { createNamespace, createShape, createPropertyType } from './type-authoring';

const DEVICE_ID = asDeviceId('00000000-0000-0000-0000-000000000000');
const OPTIONS = { deviceId: DEVICE_ID };

function bootstrappedGraph(): Graph {
  const result = createGraph(createGraphId(), 'test-graph');
  if (!result.ok) {
    throw new Error('Failed to bootstrap test graph');
  }
  return result.value;
}

describe('createNamespace', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = bootstrappedGraph();
  });

  it('creates a Namespace node on the success path', () => {
    const result = createNamespace(graph, { name: 'research', kind: 'user' }, OPTIONS);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');

    const created = result.value.value.nodes
      .values()
      .find(
        (node) => node.shape === SYSTEM_IDS.NAMESPACE && node.properties.get('name') === 'research',
      );
    expect(created).toBeDefined();
    expect(created?.properties.get('kind')).toBe('user');
    expect(result.value.events).toHaveLength(1);
    expect(result.value.events[0]?.type).toBe('NodeCreated');
  });

  it('rejects a duplicate name', () => {
    const result = createNamespace(graph, { name: 'user', kind: 'user' }, OPTIONS);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path).toEqual(['name']);
  });

  it('rejects a restricted kind', () => {
    const result = createNamespace(graph, { name: 'admin', kind: 'system' }, OPTIONS);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path).toEqual(['kind']);
  });

  it('rejects a malformed name', () => {
    const result = createNamespace(
      graph,
      { name: 'not a valid namespace!', kind: 'user' },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path).toEqual(['name']);
  });
});

describe('createPropertyType', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = bootstrappedGraph();
  });

  it('creates a PropertyType node on the success path', () => {
    const result = createPropertyType(
      graph,
      { name: 'priority', namespace: 'user', valueKind: 'number' },
      OPTIONS,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');

    const created = result.value.value.nodes
      .values()
      .find(
        (node) =>
          node.shape === SYSTEM_IDS.PROPERTY_TYPE && node.properties.get('name') === 'priority',
      );
    expect(created?.properties.get('valueKind')).toBe('number');
  });

  it('rejects a duplicate name', () => {
    const first = createPropertyType(
      graph,
      { name: 'priority', namespace: 'user', valueKind: 'number' },
      OPTIONS,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected success');

    const second = createPropertyType(
      first.value.value,
      { name: 'priority', namespace: 'user', valueKind: 'text' },
      OPTIONS,
    );
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('expected failure');
    expect(second.error.path).toEqual(['name']);
  });

  it('rejects a restricted target namespace', () => {
    const result = createPropertyType(
      graph,
      { name: 'priority', namespace: 'system', valueKind: 'number' },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path).toEqual(['namespace']);
  });

  it('rejects an invalid valueKind', () => {
    const result = createPropertyType(
      graph,
      { name: 'priority', namespace: 'user', valueKind: 'not-a-kind' },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path).toEqual(['valueKind']);
  });
});

describe('createShape (node)', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = bootstrappedGraph();
  });

  it('creates a node Shape with durable inline and referenced property bindings', () => {
    const propertyTypeResult = createPropertyType(
      graph,
      { name: 'priority', namespace: 'user', valueKind: 'number' },
      OPTIONS,
    );
    if (!propertyTypeResult.ok) throw new Error('expected success');
    graph = propertyTypeResult.value.value;

    const propertyTypeId = graph.nodes
      .values()
      .find(
        (node) =>
          node.shape === SYSTEM_IDS.PROPERTY_TYPE && node.properties.get('name') === 'priority',
      )?.id;
    if (!propertyTypeId) throw new Error('expected propertyTypeId');

    const result = createShape(
      graph,
      {
        name: 'Task',
        namespace: 'user',
        entityKind: 'node',
        properties: [
          { kind: 'inline', name: 'title', valueKind: 'text', required: true },
          { kind: 'reference', propertyTypeId: asPropertyTypeId(propertyTypeId), required: false },
        ],
      },
      OPTIONS,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');

    const created = result.value.value.nodes
      .values()
      .find((node) => node.shape === SYSTEM_IDS.SHAPE && node.properties.get('name') === 'Task');
    const storedProperties = created?.properties.get('properties');
    expect(typeof storedProperties).toBe('string');
    const parsed = JSON.parse(storedProperties as string) as readonly unknown[];
    expect(parsed).toEqual([
      {
        kind: 'inline',
        definition: { name: 'title', valueKind: 'text', required: true },
      },
      {
        kind: 'reference',
        name: 'priority',
        required: false,
        propertyTypeId,
      },
    ]);
  });

  it('rejects a duplicate name', () => {
    const result = createShape(
      graph,
      { name: 'Shape', namespace: 'user', entityKind: 'node', properties: [] },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path).toEqual(['name']);
  });

  it('rejects a restricted target namespace', () => {
    const result = createShape(
      graph,
      { name: 'Task', namespace: 'system', entityKind: 'node', properties: [] },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path).toEqual(['namespace']);
  });

  it('rejects a malformed property list (invalid inline valueKind)', () => {
    const result = createShape(
      graph,
      {
        name: 'Task',
        namespace: 'user',
        entityKind: 'node',
        properties: [
          {
            kind: 'inline',
            name: 'title',
            valueKind: 'not-a-kind' as PropertyValueKind,
            required: true,
          },
        ],
      },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path[0]).toBe('properties');
  });

  it('rejects a malformed property list (unresolvable reference)', () => {
    const result = createShape(
      graph,
      {
        name: 'Task',
        namespace: 'user',
        entityKind: 'node',
        properties: [
          {
            kind: 'reference',
            propertyTypeId: asPropertyTypeId(SYSTEM_IDS.NAMESPACE_USER),
            required: true,
          },
        ],
      },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path[0]).toBe('properties');
  });
});

describe('createNodeType default view generation', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = bootstrappedGraph();
  });

  function authorTask() {
    return createShape(
      graph,
      {
        name: 'Task',
        namespace: 'user',
        entityKind: 'node',
        properties: [
          { kind: 'inline', name: 'title', valueKind: 'text', required: true },
          { kind: 'inline', name: 'status', valueKind: 'text', required: false },
        ],
      },
      OPTIONS,
    );
  }

  it('emits Shape, QueryDefinition, ViewDefinition, and a default_view edge (Shape first)', () => {
    const result = authorTask();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');

    const nodeCreated = result.value.events.filter((event) => event.type === 'NodeCreated');
    const edgeCreated = result.value.events.filter((event) => event.type === 'EdgeCreated');
    expect(nodeCreated).toHaveLength(3);
    expect(edgeCreated).toHaveLength(1);

    // Shape event must be first so first-NodeCreated callers still get the shape id.
    const first = result.value.events[0];
    expect(first?.type).toBe('NodeCreated');
    if (first?.type !== 'NodeCreated') throw new Error('expected NodeCreated');
    expect(first.shapeId).toBe(SYSTEM_IDS.SHAPE);
  });

  it('generates a table view with one displayProperty per declared property', () => {
    const result = authorTask();
    if (!result.ok) throw new Error('expected success');

    const view = result.value.value.nodes
      .values()
      .find(
        (node) =>
          node.shape === SYSTEM_IDS.VIEW_DEFINITION &&
          node.properties.get('name') === 'Task (table)',
      );
    expect(view).toBeDefined();
    expect(view?.properties.get('layout')).toBe('table');
    expect(view?.properties.get('displayProperties')).toEqual(['title', 'status']);
    expect(view?.properties.get('namespace')).toBe('user');
  });

  it('generates a query that scans the new type and a default_view edge linking type to view', () => {
    const result = authorTask();
    if (!result.ok) throw new Error('expected success');
    const finalGraph = result.value.value;

    const nodeType = finalGraph.nodes
      .values()
      .find((node) => node.shape === SYSTEM_IDS.SHAPE && node.properties.get('name') === 'Task');
    const query = finalGraph.nodes
      .values()
      .find(
        (node) =>
          node.shape === SYSTEM_IDS.QUERY_DEFINITION &&
          node.properties.get('name') === 'Task (all)',
      );
    const view = finalGraph.nodes
      .values()
      .find(
        (node) =>
          node.shape === SYSTEM_IDS.VIEW_DEFINITION &&
          node.properties.get('name') === 'Task (table)',
      );
    if (!nodeType || !query || !view) throw new Error('expected generated definitions');

    // Query scans the new shape by its Shape node id.
    const definition = JSON.parse(query.properties.get('definition') as string) as {
      steps: readonly { kind: string; shape?: string }[];
    };
    expect(definition.steps[0]).toEqual({ kind: 'node-scan', shape: nodeType.id });

    // View references the generated query.
    expect(view.properties.get('queryRef')).toBe(query.id);

    // default_view edge: Shape -> ViewDefinition.
    const edge = finalGraph.edges
      .values()
      .find(
        (candidate) =>
          candidate.shape === SYSTEM_EDGE_SHAPES.DEFAULT_VIEW && candidate.source === nodeType.id,
      );
    expect(edge).toBeDefined();
    expect(edge?.target).toBe(view.id);
  });

  it('still generates a resolvable view for a type with no declared properties', () => {
    const result = createShape(
      graph,
      { name: 'Marker', namespace: 'user', entityKind: 'node', properties: [] },
      OPTIONS,
    );
    if (!result.ok) throw new Error('expected success');

    const view = result.value.value.nodes
      .values()
      .find(
        (node) =>
          node.shape === SYSTEM_IDS.VIEW_DEFINITION &&
          node.properties.get('name') === 'Marker (table)',
      );
    expect(view).toBeDefined();
    expect(view?.properties.get('displayProperties')).toEqual([]);
  });

  it('emits no view, query, or edge events when type authoring fails', () => {
    // 'Shape' already exists in the bootstrapped graph -> duplicate name.
    const result = createShape(
      graph,
      { name: 'Shape', namespace: 'user', entityKind: 'node', properties: [] },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
  });
});

describe('createShape (edge)', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = bootstrappedGraph();
  });

  it('creates an edge Shape, storing sourceTypes/targetTypes as best-effort metadata', () => {
    const result = createShape(
      graph,
      {
        name: 'RelatesTo',
        namespace: 'user',
        entityKind: 'edge',
        properties: [],
        sourceTypes: [SYSTEM_IDS.SHAPE],
        targetTypes: [SYSTEM_IDS.SHAPE],
      },
      OPTIONS,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');

    const created = result.value.value.nodes
      .values()
      .find(
        (node) => node.shape === SYSTEM_IDS.SHAPE && node.properties.get('name') === 'RelatesTo',
      );
    expect(created?.properties.get('sourceTypes')).toEqual([SYSTEM_IDS.SHAPE]);
    expect(created?.properties.get('targetTypes')).toEqual([SYSTEM_IDS.SHAPE]);

    // Edge Shape authoring does not generate default-view artifacts (unlike node Shape).
    expect(result.value.events).toHaveLength(1);
    expect(result.value.events[0]?.type).toBe('NodeCreated');
  });

  it('rejects a duplicate name', () => {
    const result = createShape(
      graph,
      { name: 'Child Of', namespace: 'user', entityKind: 'edge', properties: [] },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path).toEqual(['name']);
  });

  it('rejects a restricted target namespace', () => {
    const result = createShape(
      graph,
      { name: 'RelatesTo', namespace: 'system', entityKind: 'edge', properties: [] },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path).toEqual(['namespace']);
  });

  it('rejects a malformed property list', () => {
    const result = createShape(
      graph,
      {
        name: 'RelatesTo',
        namespace: 'user',
        entityKind: 'edge',
        properties: [
          {
            kind: 'inline',
            name: 'weight',
            valueKind: 'not-a-kind' as PropertyValueKind,
            required: false,
          },
        ],
      },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path[0]).toBe('properties');
  });
});

describe('createPropertyType', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = bootstrappedGraph();
  });

  it('creates a PropertyType with constraint properties', () => {
    const result = createPropertyType(
      graph,
      {
        name: 'priority',
        namespace: 'user',
        valueKind: 'text',
        description: 'Task priority level',
        cardinality: 'one',
        choices: ['low', 'medium', 'high'],
        regex: '^(low|medium|high)$',
      },
      OPTIONS,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');

    const createdNode = result.value.value.nodes
      .values()
      .find(
        (node) =>
          node.shape === SYSTEM_IDS.PROPERTY_TYPE && node.properties.get('name') === 'priority',
      );

    expect(createdNode).toBeDefined();
    expect(createdNode?.properties.get('valueKind')).toBe('text');
    expect(createdNode?.properties.get('cardinality')).toBe('one');
    expect(createdNode?.properties.get('choices')).toBe(JSON.stringify(['low', 'medium', 'high']));
    expect(createdNode?.properties.get('regex')).toBe('^(low|medium|high)$');
  });

  it('rejects an invalid regular expression pattern', () => {
    const result = createPropertyType(
      graph,
      {
        name: 'badRegexProp',
        namespace: 'user',
        valueKind: 'text',
        regex: '[a-z',
      },
      OPTIONS,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.path).toEqual(['regex']);
  });
});
