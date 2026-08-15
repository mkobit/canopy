import type { Node } from '@canopy/graph';
import { SYSTEM_RENDER_GRANT } from './execute-wasm-render';

// Host-controlled render-grant authority. Tier selection is gated by the GRANT,
// not the plugin's manifest self-declaration (design decision 2 / finding 5): a
// plugin must not talk its way from Tier-1 into Tier-2 by declaring a capability.
// Until a real third-party install flow issues per-plugin grants, the default is
// the first-party static grant `render:raw-html` (never Tier-2); tests/e2e
// register an explicit interactive grant for a specific plugin node here.

const grantOverrides = new Map<string, string>();

// Registers (or clears) the host grant for a specific plugin node id. Used by the
// Tier-2 e2e/harness to authorize its fixture plugin; not a runtime API surface.
export const setRenderGrantForPlugin = (pluginNodeId: string, grant: string | undefined): void => {
  // eslint-disable-next-line functional/immutable-data -- encapsulated host-grant registry
  if (grant === undefined) grantOverrides.delete(pluginNodeId);
  // eslint-disable-next-line functional/immutable-data -- encapsulated host-grant registry
  else grantOverrides.set(pluginNodeId, grant);
};

// Resolves the effective host grant for a plugin node. Defaults to the
// first-party static grant, so an unregistered plugin never routes to Tier-2.
export const resolveRenderGrant = (pluginNode: Node): string =>
  grantOverrides.get(pluginNode.id) ?? SYSTEM_RENDER_GRANT;

// Resolves the render-worker guest id for a plugin node. The plugin node names
// its worker guest via a `workerGuestId` property; absent it, no worker guest is
// available (the caller stays on Tier-1).
export const resolveGuestId = (pluginNode: Node): string | undefined => {
  const value = pluginNode.properties.get('workerGuestId');
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};
