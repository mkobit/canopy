import { describe, it, expect } from 'bun:test';
import {
  asGraphId,
  asNamespace,
  createDeviceId,
  createGraph,
  createNamespace,
  createNodeType,
  createEdgeType,
  createPropertyType,
  unwrap,
  type Graph,
} from '@canopy/graph';
import {
  listNamespaces,
  listCreatableNamespaceKinds,
  listNodeTypesIn,
  listAllNodeTypes,
  listEdgeTypesIn,
  listPropertyTypesIn,
  listAllPropertyTypes,
} from '../schema';

const OPTIONS = { deviceId: createDeviceId() };

function bootstrappedGraph(): Graph {
  return unwrap(createGraph(asGraphId('test-schema-utils'), 'Test'));
}

describe('listNamespaces', () => {
  it('returns the 4 migrated namespaces from a bootstrapped graph', () => {
    const graph = bootstrappedGraph();
    const names = listNamespaces(graph)
      .map((ns) => ns.name)
      .toSorted((a, b) => a.localeCompare(b));
    expect(names).toEqual(['imported', 'system', 'user', 'user-settings'].map(asNamespace));
  });

  it('reflects a newly created namespace', () => {
    const graph = bootstrappedGraph();
    const result = unwrap(createNamespace(graph, { name: 'my-ns', kind: 'user' }, OPTIONS));
    const names = listNamespaces(result.graph).map((ns) => ns.name);
    expect(names).toContain(asNamespace('my-ns'));
  });
});

describe('listCreatableNamespaceKinds', () => {
  it('excludes restricted kinds', () => {
    const graph = bootstrappedGraph();
    const kinds = listCreatableNamespaceKinds(listNamespaces(graph));
    expect(kinds).not.toContain('system');
    expect(kinds).toContain('user');
  });
});

describe('listNodeTypesIn / listAllNodeTypes', () => {
  it('scopes NodeTypes to their namespace and finds them across all namespaces', () => {
    const graph = bootstrappedGraph();
    const result = unwrap(
      createNodeType(graph, { name: 'task', namespace: 'user', properties: [] }, OPTIONS),
    );

    const userTypes = listNodeTypesIn(result.graph, 'user');
    expect(userTypes.map((t) => t.name)).toContain('task');
    expect(listNodeTypesIn(result.graph, 'system').map((t) => t.name)).not.toContain('task');
    expect(listAllNodeTypes(result.graph).map((t) => t.name)).toContain('task');
  });
});

describe('listEdgeTypesIn', () => {
  it('carries sourceTypes/targetTypes through', () => {
    const graph = bootstrappedGraph();
    const nodeTypeResult = unwrap(
      createNodeType(graph, { name: 'task', namespace: 'user', properties: [] }, OPTIONS),
    );
    const taskTypeId = [...nodeTypeResult.graph.nodes.values()].find(
      (n) => n.properties.get('name') === 'task',
    )?.id;
    expect(taskTypeId).toBeDefined();
    if (!taskTypeId) return;

    const edgeResult = unwrap(
      createEdgeType(
        nodeTypeResult.graph,
        {
          name: 'blocks',
          namespace: 'user',
          properties: [],
          sourceTypes: [taskTypeId],
          targetTypes: [taskTypeId],
        },
        OPTIONS,
      ),
    );

    const edgeTypes = listEdgeTypesIn(edgeResult.graph, 'user');
    expect(edgeTypes).toHaveLength(1);
    expect(edgeTypes[0]?.sourceTypes).toEqual([taskTypeId]);
    expect(edgeTypes[0]?.targetTypes).toEqual([taskTypeId]);
  });
});

describe('listPropertyTypesIn / listAllPropertyTypes', () => {
  it('scopes PropertyTypes to their namespace and finds them across all namespaces', () => {
    const graph = bootstrappedGraph();
    const result = unwrap(
      createPropertyType(
        graph,
        { name: 'priority', namespace: 'user', valueKind: 'number' },
        OPTIONS,
      ),
    );

    const userProps = listPropertyTypesIn(result.graph, 'user');
    expect(userProps.map((p) => p.name)).toContain('priority');
    expect(listPropertyTypesIn(result.graph, 'system').map((p) => p.name)).not.toContain(
      'priority',
    );
    expect(listAllPropertyTypes(result.graph).map((p) => p.name)).toContain('priority');
  });
});
