import { z } from 'zod';
import { fromThrowable, type Node } from '@canopy/graph';
import { grantsCapabilityExplicitly, intersectCapabilities } from '@canopy/api-adapter';
import { resolveGuestId, resolveRenderGrant } from './render-grants';

// Resolves the render tier for a `rendererKind: 'wasm'` plugin from its EFFECTIVE
// GRANTED scope (spec: content-rendering-plugin → render tier selection).
// Tier-2 requires ALL of: an explicit non-wildcard `render:interactive` in the
// host grant (so a `render:*`/`*` grant does not auto-convey it — finding 5), a
// manifest that declares `render:interactive` (so the intersected token actually
// carries it), and a resolvable worker guest. An authorized interactive renderer
// without a guest fails closed instead of silently downgrading to Tier-1.

export type WasmRenderDispatch =
  | Readonly<{ tier: 'tier1' }>
  | Readonly<{ tier: 'tier2'; token: string; guestId: string }>
  | Readonly<{ tier: 'unavailable'; reason: 'missing-guest' }>;

const manifestSchema = z.object({ capabilities: z.array(z.string()) });

const parseManifestCapabilities = (pluginNode: Node): readonly string[] => {
  const raw = pluginNode.properties.get('manifest');
  if (typeof raw !== 'string') return [];
  const decoded = fromThrowable<unknown>(() => JSON.parse(raw));
  if (!decoded.ok) return [];
  const parsed = manifestSchema.safeParse(decoded.value);
  return parsed.success ? parsed.data.capabilities : [];
};

export const resolveWasmRenderDispatch = (pluginNode: Node): WasmRenderDispatch => {
  const grant = resolveRenderGrant(pluginNode);
  // Gate on the host grant, not the manifest (decision 2).
  if (!grantsCapabilityExplicitly(grant, 'render:interactive')) {
    return { tier: 'tier1' };
  }
  const token = intersectCapabilities(parseManifestCapabilities(pluginNode), grant);
  // The manifest must also declare it, or the guest is not authorized for live output.
  if (!grantsCapabilityExplicitly(token, 'render:interactive')) {
    return { tier: 'tier1' };
  }
  const guestId = resolveGuestId(pluginNode);
  if (guestId === undefined) {
    return { tier: 'unavailable', reason: 'missing-guest' };
  }
  return { tier: 'tier2', token, guestId };
};
