import { describe, it, expect } from 'bun:test';
import { resolveNamespace } from './namespace';
import { asGraphId, asNodeId, asTypeId, createInstant, type Graph, type Node } from '@canopy/types';
import { SYSTEM_IDS } from './system';

describe('resolveNamespace', () => {
  const dummyMetadata = {
    created: createInstant(),
    modified: createInstant(),
  };

  const graph: Graph = {
    id: asGraphId('test-graph'),
    name: 'Test Graph',
    metadata: dummyMetadata,
    nodes: new Map<import('@canopy/types').NodeId, Node>([
      [
        asNodeId('my-type'),
        {
          id: asNodeId('my-type'),
          type: SYSTEM_IDS.NODE_TYPE,
          properties: new Map<string, import('@canopy/types').PropertyValue>([
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
          properties: new Map<string, import('@canopy/types').PropertyValue>(),
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
    expect(resolveNamespace(graph, node)).toBe('user-settings');
  });

  it('falls back to type definition namespace if no override', () => {
    const node: Node = {
      id: asNodeId('node-2'),
      type: asTypeId('my-type'),
      properties: new Map(),
      metadata: dummyMetadata,
    };
    expect(resolveNamespace(graph, node)).toBe('imported');
  });

  it('returns user if type definition has no namespace', () => {
    const node: Node = {
      id: asNodeId('node-3'),
      type: asTypeId('my-type-no-ns'),
      properties: new Map(),
      metadata: dummyMetadata,
    };
    expect(resolveNamespace(graph, node)).toBe('user');
  });

  it('returns user if type is unknown', () => {
    const node: Node = {
      id: asNodeId('node-4'),
      type: asTypeId('unknown-type'),
      properties: new Map(),
      metadata: dummyMetadata,
    };
    expect(resolveNamespace(graph, node)).toBe('user');
  });
});
