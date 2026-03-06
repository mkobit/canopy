import { describe, it, expect } from 'bun:test';
import { createGraph } from './graph';
import { asGraphId, asNodeId, asTypeId, unwrap, createInstant } from '@canopy/types';
import { SYSTEM_IDS } from './system';
import { findSettingsSchema, resolveSetting } from './settings';
import { addNode } from './ops';
import { SYSTEM_DEVICE_ID } from './bootstrap';

describe('Settings Resolver', () => {
  it('findSettingsSchema returns the schema node for a known key', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));
    const schema = findSettingsSchema(graph, 'display-density');
    expect(schema).toBeDefined();
    expect(schema?.id).toBe(SYSTEM_IDS.SETTING_DISPLAY_DENSITY);
    expect(schema?.properties.get('key')).toBe('display-density');
  });

  it('findSettingsSchema returns undefined for an unknown key', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));
    const schema = findSettingsSchema(graph, 'unknown-setting-key');
    expect(schema).toBeUndefined();
  });

  it("resolveSetting returns undefined when schema doesn't exist", () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));
    const nodeId = asNodeId('test:node');
    const typeId = asTypeId('test:type');

    const value = resolveSetting(graph, 'unknown-setting-key', nodeId, typeId, 'user');
    expect(value).toBeUndefined();
  });

  it('resolveSetting returns system default when no UserSetting exists', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));
    const nodeId = asNodeId('test:node');
    const typeId = asTypeId('test:type');

    // Default value for display-density is "comfortable"
    const value = resolveSetting(graph, 'display-density', nodeId, typeId, 'user');
    expect(value).toBe('comfortable');
  });

  it('resolveSetting returns global UserSetting when present (over default)', () => {
    let graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    // Add global UserSetting
    const settingNode = {
      id: asNodeId('user:setting:global'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', SYSTEM_IDS.SETTING_DISPLAY_DENSITY],
        ['scopeType', 'global'],
        ['value', '"compact"'], // JSON-encoded string
      ]),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    const res = addNode(graph, settingNode, { deviceId: SYSTEM_DEVICE_ID });
    graph = unwrap(res).graph;

    const nodeId = asNodeId('test:node');
    const typeId = asTypeId('test:type');

    const value = resolveSetting(graph, 'display-density', nodeId, typeId, 'user');
    expect(value).toBe('compact');
  });

  it('resolveSetting returns per-namespace UserSetting over global', () => {
    let graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    // Global UserSetting
    const globalSetting = {
      id: asNodeId('user:setting:global'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', SYSTEM_IDS.SETTING_DEFAULT_RENDERER],
        ['scopeType', 'global'],
        ['value', '"global-renderer"'],
      ]),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    graph = unwrap(addNode(graph, globalSetting, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // Namespace UserSetting
    const namespaceSetting = {
      id: asNodeId('user:setting:namespace'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', SYSTEM_IDS.SETTING_DEFAULT_RENDERER],
        ['scopeType', 'namespace'],
        ['scopeTarget', 'user'],
        ['value', '"namespace-renderer"'],
      ]),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    graph = unwrap(addNode(graph, namespaceSetting, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const nodeId = asNodeId('test:node');
    const typeId = asTypeId('test:type');

    // user namespace should hit namespace setting
    let value = resolveSetting(graph, 'default-renderer', nodeId, typeId, 'user');
    expect(value).toBe('namespace-renderer');

    // system namespace should fallback to global setting
    value = resolveSetting(graph, 'default-renderer', nodeId, typeId, 'system');
    expect(value).toBe('global-renderer');
  });

  it('resolveSetting returns per-type UserSetting over per-namespace', () => {
    let graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    const namespaceSetting = {
      id: asNodeId('user:setting:namespace'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', SYSTEM_IDS.SETTING_DEFAULT_RENDERER],
        ['scopeType', 'namespace'],
        ['scopeTarget', 'user'],
        ['value', '"namespace-renderer"'],
      ]),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    graph = unwrap(addNode(graph, namespaceSetting, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const typeId = asTypeId('test:type');
    const typeSetting = {
      id: asNodeId('user:setting:type'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', SYSTEM_IDS.SETTING_DEFAULT_RENDERER],
        ['scopeType', 'type'],
        ['scopeTarget', typeId],
        ['value', '"type-renderer"'],
      ]),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    graph = unwrap(addNode(graph, typeSetting, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const nodeId = asNodeId('test:node');

    // Specific type should hit type setting
    let value = resolveSetting(graph, 'default-renderer', nodeId, typeId, 'user');
    expect(value).toBe('type-renderer');

    // Other type should fallback to namespace setting
    const otherTypeId = asTypeId('test:other-type');
    value = resolveSetting(graph, 'default-renderer', nodeId, otherTypeId, 'user');
    expect(value).toBe('namespace-renderer');
  });

  it('resolveSetting returns per-node UserSetting over per-type', () => {
    let graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    const typeId = asTypeId('test:type');
    const typeSetting = {
      id: asNodeId('user:setting:type'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', SYSTEM_IDS.SETTING_DEFAULT_RENDERER],
        ['scopeType', 'type'],
        ['scopeTarget', typeId],
        ['value', '"type-renderer"'],
      ]),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    graph = unwrap(addNode(graph, typeSetting, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const nodeId = asNodeId('test:node');
    const nodeSetting = {
      id: asNodeId('user:setting:node'),
      type: SYSTEM_IDS.USER_SETTING,
      properties: new Map([
        ['schemaId', SYSTEM_IDS.SETTING_DEFAULT_RENDERER],
        ['scopeType', 'node'],
        ['scopeTarget', nodeId],
        ['value', '"node-renderer"'],
      ]),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    graph = unwrap(addNode(graph, nodeSetting, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // Specific node should hit node setting
    let value = resolveSetting(graph, 'default-renderer', nodeId, typeId, 'user');
    expect(value).toBe('node-renderer');

    // Other node should fallback to type setting
    const otherNodeId = asNodeId('test:other-node');
    value = resolveSetting(graph, 'default-renderer', otherNodeId, typeId, 'user');
    expect(value).toBe('type-renderer');
  });
});
