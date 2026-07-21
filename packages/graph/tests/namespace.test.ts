import { describe, it, expect } from 'bun:test';
import { getNodesInNamespace } from '../src/resolve-namespace';
import { addNode } from '../src/ops';
import { createGraph } from '../src/create-graph';
import { SYSTEM_IDS } from '../src/system';
import {
  createNodeId,
  asTypeId,
  asNamespace,
  createInstant,
  PropertyValue,
  Node,
  createGraphId,
  asDeviceId,
  asNodeId,
  unwrap,
  NodeId,
  TypeId,
} from '@canopy/graph';

function createNode(properties: Record<string, unknown> = {}): Node {
  const innerProps =
    properties.properties && typeof properties.properties === 'object'
      ? properties.properties
      : properties;
  const filteredProps = { ...innerProps };
  delete (filteredProps as Record<string, unknown>).id;
  delete (filteredProps as Record<string, unknown>).type;

  return {
    id: (properties.id as NodeId) ?? createNodeId(),
    type: (properties.type as TypeId) ?? asTypeId('test-type'),
    properties: new Map<string, PropertyValue>(
      Object.entries(filteredProps) as [string, PropertyValue][],
    ),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
    },
  } as unknown as Node;
}

describe('namespace utilities', () => {
  it('should find nodes by namespace', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

    // Create a type with 'imported' namespace
    const importedType = createNode({
      id: asNodeId('type-imported'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {
        name: 'ImportedType',
        namespace: 'imported',
      },
    });

    // Create a type with no namespace (defaults to user)
    const normalType = createNode({
      id: asNodeId('type-normal'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {
        name: 'NormalType',
      },
    });

    graph = unwrap(
      addNode(graph, importedType, {
        deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
      }),
    ).graph;
    graph = unwrap(
      addNode(graph, normalType, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // Node 1: uses imported type, no override -> imported
    const node1 = createNode({
      type: asTypeId('type-imported'),
    });
    graph = unwrap(
      addNode(graph, node1, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // Node 2: uses imported type, overrides to 'user-settings'
    const node2 = createNode({
      type: asTypeId('type-imported'),
      properties: {
        namespace: 'user-settings',
      },
    });
    graph = unwrap(
      addNode(graph, node2, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // Node 3: uses normal type, overrides to 'imported'
    const node3 = createNode({
      type: asTypeId('type-normal'),
      properties: {
        namespace: 'imported',
      },
    });
    graph = unwrap(
      addNode(graph, node3, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // Node 4: uses normal type, no override -> user
    const node4 = createNode({
      type: asTypeId('type-normal'),
    });
    graph = unwrap(
      addNode(graph, node4, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    const importedNodes = getNodesInNamespace(graph, asNamespace('imported'));
    expect(importedNodes.length).toBe(3); // The type definition itself, node1, and node3
    expect(importedNodes.map((n) => n.id).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [importedType.id, node1.id, node3.id].toSorted((a, b) => a.localeCompare(b)),
    );

    const userSettingsNodes = getNodesInNamespace(graph, asNamespace('user-settings')).filter((n) =>
      [importedType.id, normalType.id, node1.id, node2.id, node3.id, node4.id].includes(n.id),
    );
    expect(userSettingsNodes.length).toBe(1);
    const [firstUserSettingsNode] = userSettingsNodes;
    if (firstUserSettingsNode === undefined) throw new Error('Expected node');
    expect(firstUserSettingsNode.id).toBe(node2.id);

    const userNodes = getNodesInNamespace(graph, asNamespace('user')).filter((n) =>
      [importedType.id, normalType.id, node1.id, node2.id, node3.id, node4.id].includes(n.id),
    );
    expect(userNodes.length).toBe(1); // node4 defaults to user
    const [firstUserNode] = userNodes;
    if (firstUserNode === undefined) throw new Error('Expected node');
    expect(firstUserNode.id).toBe(node4.id);

    const systemNodes = getNodesInNamespace(graph, asNamespace('system')).filter((n) =>
      [importedType.id, normalType.id, node1.id, node2.id, node3.id, node4.id].includes(n.id),
    );
    expect(systemNodes.length).toBe(1); // normalType definition resolves to system because its type is NODE_TYPE which has 'system' namespace
    const [firstSystemNode] = systemNodes;
    if (firstSystemNode === undefined) throw new Error('Expected node');
    expect(firstSystemNode.id).toBe(normalType.id);
  });
});
