import { describe, it, expect } from 'bun:test';
import { createGraph } from '../src/create-graph';
import { validateNode } from '../src/validation';
import {
  validateWasmBinaryProperty,
  validatePluginManifestProperty,
} from '../src/plugin-validation';
import { SYSTEM_IDS } from '../src/system';
import {
  asTypeId,
  createNodeId,
  createGraphId,
  createInstant,
  unwrap,
  PropertyValue,
  asDeviceId,
} from '@canopy/graph';
import type { Node } from '@canopy/graph';

// Test helper to create a node
function createTestNode(properties: Record<string, unknown>): Node {
  return {
    id: createNodeId(),
    type: asTypeId('test'),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
    },
    ...properties,
    properties:
      properties.properties && !(properties.properties instanceof Map)
        ? new Map(Object.entries(properties.properties as Record<string, PropertyValue>))
        : (properties.properties as Map<string, PropertyValue>) || new Map<string, PropertyValue>(),
  } as unknown as Node;
}

describe('WASM binary property validation', () => {
  it('passes on valid base64 with WebAssembly magic header', () => {
    const validWasmBase64 = 'AGFzbQAAAAEAAAAB'; // starts with \x00asm
    const errors = validateWasmBinaryProperty(validWasmBase64, 'wasm_binary');
    expect(errors).toHaveLength(0);
  });

  it('rejects non-string values', () => {
    const errors = validateWasmBinaryProperty(123, 'wasm_binary');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('must be a string');
  });

  it('rejects invalid base64 characters', () => {
    const errors = validateWasmBinaryProperty('invalid-base64-characters-!!!', 'wasm_binary');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('is not a valid base64-encoded string');
  });

  it('rejects base64 string missing WASM magic header', () => {
    const helloWorldBase64 = 'SGVsbG8gd29ybGQ='; // "Hello world"
    const errors = validateWasmBinaryProperty(helloWorldBase64, 'wasm_binary');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('missing the WebAssembly magic binary header');
  });
});

describe('plugin manifest property validation', () => {
  it('passes on a valid minimal manifest', () => {
    const manifestJson = JSON.stringify({
      name: 'test-plugin',
      version: '1.0.0',
      capabilities: ['wizard'],
    });
    const errors = validatePluginManifestProperty(manifestJson, 'manifest');
    expect(errors).toHaveLength(0);
  });

  it('passes on a valid full manifest with menuItems and commands', () => {
    const manifestJson = JSON.stringify({
      name: 'full-plugin',
      version: '2.1.0',
      description: 'A test plugin description',
      capabilities: ['wizard', 'settings'],
      menuItems: [{ label: 'Run Wizard', command: 'test.run', shortcut: 'Ctrl+Shift+W' }],
      commands: [{ id: 'test.run', title: 'Run Test Plugin Wizard', category: 'Testing' }],
    });
    const errors = validatePluginManifestProperty(manifestJson, 'manifest');
    expect(errors).toHaveLength(0);
  });

  it('rejects non-string values', () => {
    const errors = validatePluginManifestProperty(123, 'manifest');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('must be a string');
  });

  it('rejects invalid JSON string', () => {
    const errors = validatePluginManifestProperty('{"name": "my-plugin"', 'manifest');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('must be a valid JSON string');
  });

  it('rejects JSON that is not an object', () => {
    const errors = validatePluginManifestProperty(JSON.stringify([1, 2, 3]), 'manifest');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('must parse to a JSON object');
  });

  it('rejects missing or empty name', () => {
    const manifestJson = JSON.stringify({
      version: '1.0.0',
      capabilities: ['wizard'],
    });
    const errors = validatePluginManifestProperty(manifestJson, 'manifest');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Manifest property 'name' must be a non-empty string");
  });

  it('rejects missing or empty version', () => {
    const manifestJson = JSON.stringify({
      name: 'my-plugin',
      capabilities: ['wizard'],
    });
    const errors = validatePluginManifestProperty(manifestJson, 'manifest');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Manifest property 'version' must be a non-empty string");
  });

  it('rejects non-array capabilities', () => {
    const manifestJson = JSON.stringify({
      name: 'my-plugin',
      version: '1.0.0',
      capabilities: 'wizard',
    });
    const errors = validatePluginManifestProperty(manifestJson, 'manifest');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Manifest property 'capabilities' must be an array");
  });

  it('rejects empty or non-string capability items', () => {
    const manifestJson = JSON.stringify({
      name: 'my-plugin',
      version: '1.0.0',
      capabilities: ['wizard', '', 123],
    });
    const errors = validatePluginManifestProperty(manifestJson, 'manifest');
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain('element at index 1 must be a non-empty string');
    expect(errors[1]?.message).toContain('element at index 2 must be a non-empty string');
  });

  it('rejects invalid menuItems structure', () => {
    const manifestJson = JSON.stringify({
      name: 'my-plugin',
      version: '1.0.0',
      capabilities: ['wizard'],
      menuItems: 'not-an-array',
    });
    const errors = validatePluginManifestProperty(manifestJson, 'manifest');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Manifest property 'menuItems' must be an array");
  });

  it('rejects missing label or command in menuItems', () => {
    const manifestJson = JSON.stringify({
      name: 'my-plugin',
      version: '1.0.0',
      capabilities: ['wizard'],
      menuItems: [{ command: 'test.cmd' }, { label: 'Item 2', shortcut: 'Ctrl+K' }],
    });
    const errors = validatePluginManifestProperty(manifestJson, 'manifest');
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain("Menu item 'label' must be a non-empty string");
    expect(errors[1]?.message).toContain("Menu item 'command' must be a non-empty string");
  });

  it('rejects invalid commands structure', () => {
    const manifestJson = JSON.stringify({
      name: 'my-plugin',
      version: '1.0.0',
      capabilities: ['wizard'],
      commands: 'not-an-array',
    });
    const errors = validatePluginManifestProperty(manifestJson, 'manifest');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Manifest property 'commands' must be an array");
  });

  it('rejects missing id or title in commands', () => {
    const manifestJson = JSON.stringify({
      name: 'my-plugin',
      version: '1.0.0',
      capabilities: ['wizard'],
      commands: [{ title: 'Command 1' }, { id: 'cmd2', category: 'Testing' }],
    });
    const errors = validatePluginManifestProperty(manifestJson, 'manifest');
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain("Command 'id' must be a non-empty string");
    expect(errors[1]?.message).toContain("Command 'title' must be a non-empty string");
  });
});

describe('node validation integration for Plugin nodes', () => {
  it('validates a valid plugin node', () => {
    const g = unwrap(createGraph(createGraphId(), 'System Graph'));

    const validPlugin = createTestNode({
      type: SYSTEM_IDS.TYPE_PLUGIN,
      properties: {
        wasm_binary: 'AGFzbQAAAAEAAAAB',
        manifest: JSON.stringify({
          name: 'my-plugin',
          version: '1.0.0',
          capabilities: ['wizard'],
        }),
        version: '1.0.0',
      },
    });

    const result = validateNode(g, validPlugin);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a plugin node with invalid properties', () => {
    const g = unwrap(createGraph(createGraphId(), 'System Graph'));

    const invalidPlugin = createTestNode({
      type: SYSTEM_IDS.TYPE_PLUGIN,
      properties: {
        wasm_binary: 'SGVsbG8gd29ybGQ=', // Missing magic header
        manifest: '{"name": "my-plugin"', // Invalid JSON
        version: '1.0.0',
      },
    });

    const result = validateNode(g, invalidPlugin);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.message.includes('magic binary header'))).toBe(true);
    expect(result.errors.some((e) => e.message.includes('valid JSON string'))).toBe(true);
  });
});
