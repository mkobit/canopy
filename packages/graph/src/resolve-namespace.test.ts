import { describe, it, expect } from 'bun:test';
import { resolveNamespace, parseNamespace } from './resolve-namespace';
import {
  asGraphId,
  asNodeId,
  asTypeId,
  createGraph,
  createGraphId,
  createInstant,
  type Graph,
  type Node,
  asDeviceId,
  unwrap,
  asNamespace,
} from '@canopy/graph';
import { SYSTEM_IDS } from './system';
import { createNamespace, removeNode } from './ops';

describe('resolveNamespace', () => {
  const dummyMetadata = {
    created: createInstant(),
    modified: createInstant(),
    modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
  };

  function namespaceNode(name: string): [import('@canopy/graph').NodeId, Node] {
    const id = asNodeId(`namespace:${name}`);
    return [
      id,
      {
        id,
        type: SYSTEM_IDS.NAMESPACE,
        properties: new Map<string, import('@canopy/graph').PropertyValue>([
          ['name', name],
          ['kind', name],
        ]),
        metadata: dummyMetadata,
      },
    ];
  }

  const graph: Graph = {
    id: asGraphId('test-graph'),
    name: 'Test Graph',
    metadata: dummyMetadata,
    nodes: new Map<import('@canopy/graph').NodeId, Node>([
      namespaceNode('imported'),
      namespaceNode('user'),
      namespaceNode('user-settings'),
      [
        asNodeId('my-type'),
        {
          id: asNodeId('my-type'),
          type: SYSTEM_IDS.NODE_TYPE,
          properties: new Map<string, import('@canopy/graph').PropertyValue>([
            ['namespace', 'imported'],
          ]),
          metadata: dummyMetadata,
        },
      ],
      [
        asNodeId('my-type-no-ns'),
        {
          id: asNodeId('my-type-no-ns'),
          type: SYSTEM_IDS.NODE_TYPE,
          properties: new Map<string, import('@canopy/graph').PropertyValue>(),
          metadata: dummyMetadata,
        },
      ],
    ]),
    edges: new Map(),
  };

  it('resolves to node property override if present', () => {
    const node: Node = {
      id: asNodeId('node-1'),
      type: asTypeId('my-type'),
      properties: new Map([['namespace', 'user-settings']]),
      metadata: dummyMetadata,
    };
    expect(resolveNamespace(graph, node)).toBe(asNamespace('user-settings'));
  });

  it('falls back to type definition namespace if no override', () => {
    const node: Node = {
      id: asNodeId('node-2'),
      type: asTypeId('my-type'),
      properties: new Map(),
      metadata: dummyMetadata,
    };
    expect(resolveNamespace(graph, node)).toBe(asNamespace('imported'));
  });

  it('returns user if type definition has no namespace', () => {
    const node: Node = {
      id: asNodeId('node-3'),
      type: asTypeId('my-type-no-ns'),
      properties: new Map(),
      metadata: dummyMetadata,
    };
    expect(resolveNamespace(graph, node)).toBe(asNamespace('user'));
  });

  it('returns user if type is unknown', () => {
    const node: Node = {
      id: asNodeId('node-4'),
      type: asTypeId('unknown-type'),
      properties: new Map(),
      metadata: dummyMetadata,
    };
    expect(resolveNamespace(graph, node)).toBe(asNamespace('user'));
  });

  it('ignores an override that does not match any Namespace node', () => {
    const node: Node = {
      id: asNodeId('node-5'),
      type: asTypeId('my-type'),
      properties: new Map([['namespace', 'not-a-real-namespace']]),
      metadata: dummyMetadata,
    };
    // Falls through the invalid override to the type definition's namespace.
    expect(resolveNamespace(graph, node)).toBe(asNamespace('imported'));
  });
});

describe('parseNamespace', () => {
  const dummyMetadata = {
    created: createInstant(),
    modified: createInstant(),
    modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
  };

  const graph: Graph = {
    id: asGraphId('test-graph'),
    name: 'Test Graph',
    metadata: dummyMetadata,
    nodes: new Map<import('@canopy/graph').NodeId, Node>([
      [
        asNodeId('namespace:user'),
        {
          id: asNodeId('namespace:user'),
          type: SYSTEM_IDS.NAMESPACE,
          properties: new Map<string, import('@canopy/graph').PropertyValue>([
            ['name', 'user'],
            ['kind', 'user'],
          ]),
          metadata: dummyMetadata,
        },
      ],
    ]),
    edges: new Map(),
  };

  it('succeeds for a name matching an existing Namespace node', () => {
    const result = parseNamespace(graph, 'user');
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe(asNamespace('user'));
  });

  it('fails for a name with no matching Namespace node', () => {
    const result = parseNamespace(graph, 'nonexistent');
    expect(result.ok).toBe(false);
  });

  it('fails for a name with characters outside the URI path-segment format', () => {
    const result = parseNamespace(graph, 'not a valid namespace!');
    expect(result.ok).toBe(false);
  });

  it('checks the name property, not the node id', () => {
    // The node's id is 'namespace:user' but its 'name' property is 'user' -- a
    // format-valid string that merely resembles the id should still fail.
    const result = parseNamespace(graph, 'namespace-user');
    expect(result.ok).toBe(false);
  });

  it('fails for a Namespace node that has been deleted', () => {
    const bootstrapped = unwrap(createGraph(createGraphId(), 'test-graph'));
    const deviceId = asDeviceId('00000000-0000-0000-0000-000000000000');

    const created = unwrap(
      createNamespace(bootstrapped, { name: 'research', kind: 'user' }, { deviceId }),
    );
    expect(parseNamespace(created.graph, 'research').ok).toBe(true);

    const namespaceNodeId = [...created.graph.nodes.values()].find(
      (node) => node.type === SYSTEM_IDS.NAMESPACE && node.properties.get('name') === 'research',
    )?.id;
    if (namespaceNodeId === undefined) throw new Error('expected created Namespace node');

    const afterDelete = unwrap(removeNode(created.graph, namespaceNodeId, { deviceId }));
    expect(parseNamespace(afterDelete.graph, 'research').ok).toBe(false);
  });
});
