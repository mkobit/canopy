import { afterEach, describe, expect, it } from 'bun:test';
import {
  asGraphId,
  asNodeId,
  asTypeId,
  createGraph,
  createInstant,
  SYSTEM_DEVICE_ID,
  unwrap,
  type Node,
} from '@canopy/graph';
import type { WasmGuestPlugin } from '@canopy/plugin-host';
import {
  clearTier1GuestsForTest,
  executeWasmRender,
  setTier1GuestForPlugin,
} from './execute-wasm-render';

const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

const createContentNode = (content: string): Node => ({
  id: asNodeId('user:node:content-1'),
  type: asTypeId('user:nodetype:note'),
  properties: new Map([['content', content]]),
  metadata: {
    created: createInstant(),
    modified: createInstant(),
    modifiedBy: SYSTEM_DEVICE_ID,
  },
});

const createPluginNode = (id: string, properties: ReadonlyMap<string, string>): Node => ({
  id: asNodeId(id),
  type: asTypeId('canopy:system/plugin'),
  properties: new Map(properties),
  metadata: {
    created: createInstant(),
    modified: createInstant(),
    modifiedBy: SYSTEM_DEVICE_ID,
  },
});

const throwingGuest: WasmGuestPlugin = () => {
  throw new Error('Guest crashed during rendering');
};

const badOutputGuest: WasmGuestPlugin = () => JSON.stringify({ wrongKey: 'value' });

const overrideGuest: WasmGuestPlugin = () =>
  JSON.stringify({ html: '<p>overridden-guest-output</p>' });

afterEach(() => {
  clearTier1GuestsForTest();
});

describe('executeWasmRender dynamic guest resolution', () => {
  it('fails closed when plugin node is missing a manifest', async () => {
    const plugin = createPluginNode('plugin:no-manifest', new Map());
    const content = createContentNode('test content');

    const result = await executeWasmRender(graph, plugin, content);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('plugin node is missing a manifest');
    }
  });

  it('fails closed when manifest is malformed JSON', async () => {
    const plugin = createPluginNode(
      'plugin:malformed-manifest',
      new Map([['manifest', '{ not json']]),
    );
    const content = createContentNode('test content');

    const result = await executeWasmRender(graph, plugin, content);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('plugin manifest is malformed');
    }
  });

  it('fails closed when manifest declares no render capability', async () => {
    const plugin = createPluginNode(
      'plugin:inert',
      new Map([['manifest', JSON.stringify({ capabilities: ['read:nodes'] })]]),
    );
    const content = createContentNode('test content');

    const result = await executeWasmRender(graph, plugin, content);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('plugin declares no render capability');
    }
  });

  it('fails closed when guest implementation is unavailable', async () => {
    const plugin = createPluginNode(
      'plugin:missing-guest',
      new Map([
        [
          'manifest',
          JSON.stringify({
            capabilities: ['render:raw-html'],
            entrypoint: 'nonexistent-guest',
          }),
        ],
      ]),
    );
    const content = createContentNode('test content');

    const result = await executeWasmRender(graph, plugin, content);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('plugin guest is unavailable');
    }
  });

  it('resolves and executes a non-Markdown Tier-1 guest from manifest entrypoint', async () => {
    const customGuest: WasmGuestPlugin = (_bindings, inputJson) => {
      const parsed: unknown = JSON.parse(inputJson);
      const text =
        typeof parsed === 'object' && parsed !== null && 'content' in parsed
          ? String(parsed.content)
          : '';
      return JSON.stringify({ html: `<article class="custom-guest">${text}</article>` });
    };

    setTier1GuestForPlugin('custom:manifest:guest', () => customGuest);

    const plugin = createPluginNode(
      'plugin:custom-tier1-manifest',
      new Map([
        [
          'manifest',
          JSON.stringify({
            name: 'Custom Tier1 Manifest Plugin',
            capabilities: ['render:raw-html'],
            entrypoint: 'custom:manifest:guest',
          }),
        ],
      ]),
    );
    const content = createContentNode('hello custom manifest');

    const result = await executeWasmRender(graph, plugin, content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toBe('<article class="custom-guest">hello custom manifest</article>');
    }
  });

  it('resolves and executes a non-Markdown Tier-1 guest from entryPoint property', async () => {
    const customGuest: WasmGuestPlugin = (_bindings, inputJson) => {
      const parsed: unknown = JSON.parse(inputJson);
      const text =
        typeof parsed === 'object' && parsed !== null && 'content' in parsed
          ? String(parsed.content)
          : '';
      return JSON.stringify({ html: `<aside class="property-guest">${text}</aside>` });
    };

    setTier1GuestForPlugin('custom:property:guest', () => customGuest);

    const plugin = createPluginNode(
      'plugin:custom-tier1-property',
      new Map([
        ['entryPoint', 'custom:property:guest'],
        [
          'manifest',
          JSON.stringify({
            capabilities: ['render:raw-html'],
          }),
        ],
      ]),
    );
    const content = createContentNode('hello custom property');

    const result = await executeWasmRender(graph, plugin, content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toBe('<aside class="property-guest">hello custom property</aside>');
    }
  });

  it('allows options.guestLoaders to override registry resolution', async () => {
    const overrideLoaders = new Map([['custom:override:guest', () => overrideGuest]]);

    const plugin = createPluginNode(
      'plugin:override-test',
      new Map([
        [
          'manifest',
          JSON.stringify({
            capabilities: ['render:raw-html'],
            entrypoint: 'custom:override:guest',
          }),
        ],
      ]),
    );
    const content = createContentNode('irrelevant');

    const result = await executeWasmRender(graph, plugin, content, {
      guestLoaders: overrideLoaders,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toBe('<p>overridden-guest-output</p>');
    }
  });

  it('fails closed with non-fatal error when guest returns invalid output schema', async () => {
    setTier1GuestForPlugin('custom:bad-output:guest', () => badOutputGuest);

    const plugin = createPluginNode(
      'plugin:bad-output',
      new Map([
        [
          'manifest',
          JSON.stringify({
            capabilities: ['render:raw-html'],
            entrypoint: 'custom:bad-output:guest',
          }),
        ],
      ]),
    );
    const content = createContentNode('test content');

    const result = await executeWasmRender(graph, plugin, content);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('plugin returned invalid or empty render output');
    }
  });

  it('fails closed with non-fatal error when guest throws during execution', async () => {
    setTier1GuestForPlugin('custom:throwing:guest', () => throwingGuest);

    const plugin = createPluginNode(
      'plugin:throwing',
      new Map([
        [
          'manifest',
          JSON.stringify({
            capabilities: ['render:raw-html'],
            entrypoint: 'custom:throwing:guest',
          }),
        ],
      ]),
    );
    const content = createContentNode('test content');

    const result = await executeWasmRender(graph, plugin, content);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Guest crashed during rendering');
    }
  });
});
