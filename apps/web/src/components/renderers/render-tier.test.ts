import { describe, it, expect, afterEach } from 'bun:test';
import {
  asNodeId,
  asTypeId,
  createInstant,
  SYSTEM_DEVICE_ID,
  type Node,
  type PropertyValue,
} from '@canopy/graph';
import { resolveWasmRenderDispatch } from './render-tier';
import { setRenderGrantForPlugin } from './render-grants';

const buildPluginNode = (id: string, properties: Record<string, PropertyValue>): Node => ({
  id: asNodeId(id),
  type: asTypeId('canopy:system/plugin'),
  properties: new Map(Object.entries(properties)),
  metadata: { created: createInstant(), modified: createInstant(), modifiedBy: SYSTEM_DEVICE_ID },
});

const interactiveManifest = JSON.stringify({ capabilities: ['render:interactive'] });

afterEach(() => {
  setRenderGrantForPlugin('plugin:a', undefined);
});

describe('resolveWasmRenderDispatch (tier selection)', () => {
  it('defaults to Tier-1 with no host grant registered', () => {
    const node = buildPluginNode('plugin:a', {
      manifest: interactiveManifest,
      workerGuestId: 'fixture:interactive',
    });
    expect(resolveWasmRenderDispatch(node).tier).toBe('tier1');
  });

  it('routes to Tier-2 with an explicit interactive grant, manifest, and guest id', () => {
    setRenderGrantForPlugin('plugin:a', 'render:raw-html render:interactive');
    const node = buildPluginNode('plugin:a', {
      manifest: interactiveManifest,
      workerGuestId: 'fixture:interactive',
    });
    const dispatch = resolveWasmRenderDispatch(node);
    expect(dispatch.tier).toBe('tier2');
    if (dispatch.tier === 'tier2') {
      expect(dispatch.guestId).toBe('fixture:interactive');
      expect(dispatch.token).toContain('render:interactive');
    }
  });

  it('does NOT route to Tier-2 on a wildcard grant alone (non-conveyance)', () => {
    setRenderGrantForPlugin('plugin:a', 'render:*');
    const node = buildPluginNode('plugin:a', {
      manifest: interactiveManifest,
      workerGuestId: 'fixture:interactive',
    });
    expect(resolveWasmRenderDispatch(node).tier).toBe('tier1');
  });

  it('does NOT route to Tier-2 on a global wildcard grant alone', () => {
    setRenderGrantForPlugin('plugin:a', '*');
    const node = buildPluginNode('plugin:a', {
      manifest: interactiveManifest,
      workerGuestId: 'fixture:interactive',
    });
    expect(resolveWasmRenderDispatch(node).tier).toBe('tier1');
  });

  it('stays Tier-1 when the grant is interactive but the manifest does not declare it', () => {
    setRenderGrantForPlugin('plugin:a', 'render:interactive');
    const node = buildPluginNode('plugin:a', {
      manifest: JSON.stringify({ capabilities: ['render:raw-html'] }),
      workerGuestId: 'fixture:interactive',
    });
    expect(resolveWasmRenderDispatch(node).tier).toBe('tier1');
  });

  it('stays Tier-1 when no worker guest id is resolvable', () => {
    setRenderGrantForPlugin('plugin:a', 'render:interactive');
    const node = buildPluginNode('plugin:a', { manifest: interactiveManifest });
    expect(resolveWasmRenderDispatch(node).tier).toBe('tier1');
  });
});
