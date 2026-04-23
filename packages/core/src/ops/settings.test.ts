import { describe, it, expect } from 'bun:test';
import {
  createGraphId,
  createInstant,
  createNodeId,
  asDeviceId,
  isOk,
  unwrap,
  type Graph,
} from '@canopy/types';
import { SYSTEM_IDS } from '../system';
import { addUserSetting } from './settings';
import type { NodeOperationOptions } from './node';

const TEST_DEVICE_ID = asDeviceId('device:test-1');
const TEST_TIMESTAMP = createInstant();

function createEmptyGraph(): Graph {
  return {
    id: createGraphId(),
    name: 'Test Graph',
    metadata: {
      created: TEST_TIMESTAMP,
      modified: TEST_TIMESTAMP,
      modifiedBy: TEST_DEVICE_ID,
    },
    nodes: new Map(),
    edges: new Map(),
  };
}

describe('addUserSetting', () => {
  it('creates a USER_SETTING node with correct properties', () => {
    const graph = createEmptyGraph();
    const schemaId = createNodeId();
    const options: NodeOperationOptions = { deviceId: TEST_DEVICE_ID };

    const result = addUserSetting(
      graph,
      {
        schemaId,
        value: { theme: 'dark', retries: 3 },
        scopeType: 'global',
      },
      options,
    );

    expect(isOk(result)).toBe(true);
    const graphResult = unwrap(result);

    const event = graphResult.events[0];
    expect(event).toBeDefined();
    expect(event?.type).toBe('NodeCreated');

    if (event && event.type === 'NodeCreated') {
      expect(event.nodeType).toBe(SYSTEM_IDS.USER_SETTING);
      expect(event.properties.get('schemaId')).toBe(schemaId);
      expect(event.properties.get('scopeType')).toBe('global');
      expect(event.properties.has('scopeTarget')).toBe(false);

      // Verify value is JSON encoded
      const value = event.properties.get('value');
      expect(typeof value).toBe('string');
      expect(JSON.parse(value as string)).toEqual({ theme: 'dark', retries: 3 });
    }

    // Verify it was added to the graph nodes
    expect(graphResult.graph.nodes.size).toBe(1);
    const nodes = [...graphResult.graph.nodes.values()];
    const node = nodes[0];
    expect(node?.type).toBe(SYSTEM_IDS.USER_SETTING);
    expect(node?.properties.get('schemaId')).toBe(schemaId);
  });

  it('includes scopeTarget when provided', () => {
    const graph = createEmptyGraph();
    const schemaId = createNodeId();
    const options: NodeOperationOptions = { deviceId: TEST_DEVICE_ID };

    const result = addUserSetting(
      graph,
      {
        schemaId,
        value: 'some-string-value',
        scopeType: 'node',
        scopeTarget: 'node:test-target',
      },
      options,
    );

    expect(isOk(result)).toBe(true);
    const graphResult = unwrap(result);

    const event = graphResult.events[0];
    if (event && event.type === 'NodeCreated') {
      expect(event.properties.get('scopeType')).toBe('node');
      expect(event.properties.get('scopeTarget')).toBe('node:test-target');

      const value = event.properties.get('value');
      expect(JSON.parse(value as string)).toBe('some-string-value');
    }
  });
});
