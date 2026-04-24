import { describe, it, expect } from 'bun:test';
import { getNodesInNamespace } from '../src/namespace';
import { addNode } from '../src/ops';
import { createGraph } from '../src/graph';
import { SYSTEM_IDS } from '../src/system';
import {
  createNodeId,
  asTypeId,
  createInstant,
  PropertyValue,
  Node,
  createGraphId,
  asDeviceId,
  asNodeId,
  unwrap,
} from '@canopy/types';

function createNode(properties: Record<string, unknown> = {}): Node {
  return {
    id: createNodeId(),
    type: asTypeId('test-type'),
    properties: new Map<string, PropertyValue>(
      Object.entries(properties) as [string, PropertyValue][],
    ),
    metadata: { created: createInstant(), modified: createInstant() },
  };
}

describe('namespace utilities', () => {
  it('should find nodes by namespace', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

    // Create a type with 'imported' namespace
    const importedType = createNode({ name: 'ImportedType', namespace: 'imported' });
    importedType.id = asNodeId('type-imported');
    importedType.type = SYSTEM_IDS.NODE_TYPE;

    // Create a type with no namespace (defaults to user)
    const normalType = createNode({ name: 'NormalType' });
    normalType.id = asNodeId('type-normal');
    normalType.type = SYSTEM_IDS.NODE_TYPE;

    graph = unwrap(
      addNode(graph, importedType, {
        deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
      }),
    ).graph;
    graph = unwrap(
      addNode(graph, normalType, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // Node 1: uses imported type, no override -> imported
    const node1 = createNode();
    node1.type = asTypeId('type-imported');
    graph = unwrap(
      addNode(graph, node1, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // Node 2: uses imported type, overrides to 'user-settings'
    const node2 = createNode({ namespace: 'user-settings' });
    node2.type = asTypeId('type-imported');
    graph = unwrap(
      addNode(graph, node2, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // Node 3: uses normal type, overrides to 'imported'
    const node3 = createNode({ namespace: 'imported' });
    node3.type = asTypeId('type-normal');
    graph = unwrap(
      addNode(graph, node3, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // Node 4: uses normal type, no override -> user
    const node4 = createNode();
    node4.type = asTypeId('type-normal');
    graph = unwrap(
      addNode(graph, node4, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    const importedNodes = getNodesInNamespace(graph, 'imported');
    expect(importedNodes.length).toBe(3); // The type definition itself, node1, and node3
    expect(importedNodes.map((n) => n.id).toSorted()).toEqual(
      [importedType.id, node1.id, node3.id].toSorted(),
    );

    const userSettingsNodes = getNodesInNamespace(graph, 'user-settings').filter((n) =>
      [importedType.id, normalType.id, node1.id, node2.id, node3.id, node4.id].includes(n.id),
    );
    expect(userSettingsNodes.length).toBe(1);
    expect(userSettingsNodes[0].id).toBe(node2.id);

    const userNodes = getNodesInNamespace(graph, 'user').filter((n) =>
      [importedType.id, normalType.id, node1.id, node2.id, node3.id, node4.id].includes(n.id),
    );
    expect(userNodes.length).toBe(1); // node4 defaults to user
    expect(userNodes[0].id).toBe(node4.id);

    const systemNodes = getNodesInNamespace(graph, 'system').filter((n) =>
      [importedType.id, normalType.id, node1.id, node2.id, node3.id, node4.id].includes(n.id),
    );
    expect(systemNodes.length).toBe(1); // normalType definition resolves to system because its type is NODE_TYPE which has 'system' namespace
    expect(systemNodes[0].id).toBe(normalType.id);
  });
});
