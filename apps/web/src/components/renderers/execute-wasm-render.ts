import { z } from 'zod';
import type { Graph, Node } from '@canopy/graph';
import {
  createApiAdapterContext,
  executeSandboxedGuestPlugin,
  intersectCapabilities,
} from '@canopy/api-adapter';

// Implicit system render-grant. For a bundled/first-party renderer the host
// supplies this fixed grant, which `intersectCapabilities` narrows against the
// plugin manifest (capped at `render:raw-html`). Explicit graph-stored grants
// are deferred until a third-party install flow exists.
export const SYSTEM_RENDER_GRANT = 'render:raw-html';

// Output envelope contract validated at the host boundary. Never mount output
// that fails this schema — fall back to the native renderer instead.
const renderOutputSchema = z.object({ html: z.string() });

const manifestSchema = z.object({ capabilities: z.array(z.string()) });

export type WasmRenderResult =
  Readonly<{ ok: true; html: string }> | Readonly<{ ok: false; error: string }>;

// Serialize a node's raw properties as the JSON string the guest receives.
const propertiesToJson = (node: Node): string =>
  JSON.stringify(Object.fromEntries(node.properties));

// Resolve and execute a `rendererKind: 'wasm'` plugin against a content node,
// returning validated HTML or a non-fatal error the caller renders as a native
// fallback. The transpiled guest is imported lazily so unit tests and the module
// graph do not load the WASM artifact unless a WASM render actually runs.
export const executeWasmRender = async (
  graph: Graph,
  pluginNode: Node,
  contentNode: Node,
): Promise<WasmRenderResult> => {
  const manifestRaw = pluginNode.properties.get('manifest');
  if (typeof manifestRaw !== 'string') {
    return { ok: false, error: 'plugin node is missing a manifest' };
  }

  const manifestParse = manifestSchema.safeParse(JSON.parse(manifestRaw));
  if (!manifestParse.success) {
    return { ok: false, error: 'plugin manifest is malformed' };
  }

  const token = intersectCapabilities(manifestParse.data.capabilities, SYSTEM_RENDER_GRANT);
  if (token.length === 0) {
    return { ok: false, error: 'plugin declares no render capability' };
  }

  // Dynamic import + component instantiation can throw (module load, WASM
  // instantiation); convert any throw to a non-fatal error so the caller renders
  // the native fallback rather than hanging on a rejected promise.
  // eslint-disable-next-line functional/no-try-statements -- boundary guard for WASM module load/instantiation
  try {
    const { markdownRenderGuest } = await import('../../plugin/runtime/markdown-render-plugin');

    const context = createApiAdapterContext({ graph });
    const executionResult = await executeSandboxedGuestPlugin(
      context,
      token,
      propertiesToJson(contentNode),
      markdownRenderGuest,
    );

    if (!executionResult.ok) {
      return { ok: false, error: executionResult.error.message };
    }

    const outputParse = renderOutputSchema.safeParse(JSON.parse(executionResult.value));
    if (!outputParse.success || outputParse.data.html.length === 0) {
      return { ok: false, error: 'plugin returned invalid or empty render output' };
    }

    return { ok: true, html: outputParse.data.html };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};
