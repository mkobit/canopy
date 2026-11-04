import type React from 'react';
import { z } from 'zod';
import { fromThrowable, type Graph, type Node } from '@canopy/graph';
import { createGraphAccessContext } from '@canopy/graph-access';
import {
  executeSandboxedGuestPlugin,
  intersectCapabilities,
  type WasmGuestPlugin,
} from '@canopy/plugin-host';

// Implicit system render-grant. For a bundled/first-party renderer the host
// supplies this fixed grant, which `intersectCapabilities` narrows against the
// plugin manifest (capped at `render:raw-html`). Explicit graph-stored grants
// are deferred until a third-party install flow exists.
export const SYSTEM_RENDER_GRANT = 'render:raw-html';

// Output envelope contract validated at the host boundary. Never mount output
// that fails this schema — fall back to the native renderer instead.
const renderOutputSchema = z.object({ html: z.string() });

const manifestSchema = z.object({
  capabilities: z.array(z.string()),
  entrypoint: z.string().optional(),
  entryPoint: z.string().optional(),
  name: z.string().optional(),
});

type ReadonlyManifest = Readonly<{
  capabilities: readonly string[];
  entrypoint?: string | undefined;
  entryPoint?: string | undefined;
  name?: string | undefined;
}>;

export type WasmRenderErrorKind = 'unavailable' | 'execution-error';

export type WasmRenderResult =
  | Readonly<{ ok: true; html: string }>
  | Readonly<{ ok: false; error: string; errorKind?: WasmRenderErrorKind }>;

export type Tier1GuestLoader = () => Promise<WasmGuestPlugin> | WasmGuestPlugin;

export type ExecuteWasmRenderOptions = Readonly<{
  guestLoaders?: ReadonlyMap<string, Tier1GuestLoader>;
}>;

const loadMarkdownGuest: Tier1GuestLoader = async () => {
  const runtime = await import('../../plugin/runtime/markdown-render-plugin');
  return runtime.markdownRenderGuest;
};

const DEFAULT_TIER1_LOADERS: ReadonlyMap<string, Tier1GuestLoader> = new Map([
  ['system:node:plugin-canopy-markdown-renderer', loadMarkdownGuest],
  ['src/plugin/markdown/guest.ts', loadMarkdownGuest],
  ['Canopy Markdown Renderer', loadMarkdownGuest],
  ['system:renderer:markdown', loadMarkdownGuest],
]);

const guestRegistryReference: React.MutableRefObject<ReadonlyMap<string, Tier1GuestLoader>> = {
  current: DEFAULT_TIER1_LOADERS,
};

export const setTier1GuestForPlugin = (
  key: string,
  loader: Tier1GuestLoader | undefined,
): boolean => {
  const currentEntries = [...guestRegistryReference.current].filter(
    ([entryKey]) => entryKey !== key,
  );
  guestRegistryReference.current = new Map(
    loader === undefined ? currentEntries : [...currentEntries, [key, loader]],
  );
  return true;
};

export const clearTier1GuestsForTest = (): boolean => {
  guestRegistryReference.current = DEFAULT_TIER1_LOADERS;
  return true;
};

const extractCandidateGuestKeys = (
  pluginNode: Node,
  manifest: ReadonlyManifest,
): readonly string[] => {
  const propertyEntryPoint = pluginNode.properties.get('entryPoint');
  const propertyEntrypoint = pluginNode.properties.get('entrypoint');
  const propertyGuestId = pluginNode.properties.get('guestId');
  const propertyWorkerGuestId = pluginNode.properties.get('workerGuestId');

  const candidates: readonly (string | undefined)[] = [
    manifest.entrypoint,
    manifest.entryPoint,
    typeof propertyEntryPoint === 'string' ? propertyEntryPoint : undefined,
    typeof propertyEntrypoint === 'string' ? propertyEntrypoint : undefined,
    typeof propertyGuestId === 'string' ? propertyGuestId : undefined,
    typeof propertyWorkerGuestId === 'string' ? propertyWorkerGuestId : undefined,
    manifest.name,
    pluginNode.id,
  ];

  return candidates.filter((key): key is string => typeof key === 'string' && key.length > 0);
};

export const resolveTier1GuestLoader = (
  pluginNode: Node,
  manifest: ReadonlyManifest,
  options?: ExecuteWasmRenderOptions,
): Tier1GuestLoader | undefined => {
  const candidateKeys = extractCandidateGuestKeys(pluginNode, manifest);
  const overrideLoaders = options?.guestLoaders;
  const matchKey = candidateKeys.find(
    (key) => (overrideLoaders?.get(key) ?? guestRegistryReference.current.get(key)) !== undefined,
  );

  return matchKey === undefined
    ? undefined
    : (overrideLoaders?.get(matchKey) ?? guestRegistryReference.current.get(matchKey));
};

// Serialize a node's raw properties as the JSON string the guest receives.
const propertiesToJson = (node: Node): string =>
  JSON.stringify(Object.fromEntries(node.properties));

// Resolve and execute a `rendererKind: 'wasm'` plugin against a content node,
// returning validated HTML or a non-fatal error the caller renders as a native
// fallback. Guest implementation is resolved dynamically from plugin node metadata
// and imported lazily so unit tests and the module graph do not load the WASM artifact
// unless a WASM render actually runs.
export const executeWasmRender = async (
  graph: Graph,
  pluginNode: Node,
  contentNode: Node,
  options?: ExecuteWasmRenderOptions,
): Promise<WasmRenderResult> => {
  const manifestRaw = pluginNode.properties.get('manifest');
  if (typeof manifestRaw !== 'string') {
    return { ok: false, error: 'plugin node is missing a manifest', errorKind: 'unavailable' };
  }

  const decodedManifest = fromThrowable<unknown>(() => JSON.parse(manifestRaw));
  if (!decodedManifest.ok) {
    return { ok: false, error: 'plugin manifest is malformed', errorKind: 'unavailable' };
  }

  const manifestParse = manifestSchema.safeParse(decodedManifest.value);
  if (!manifestParse.success) {
    return { ok: false, error: 'plugin manifest is malformed', errorKind: 'unavailable' };
  }

  const token = intersectCapabilities(manifestParse.data.capabilities, SYSTEM_RENDER_GRANT);
  if (token.length === 0) {
    return { ok: false, error: 'plugin declares no render capability', errorKind: 'unavailable' };
  }

  const guestLoader = resolveTier1GuestLoader(pluginNode, manifestParse.data, options);
  if (guestLoader === undefined) {
    return { ok: false, error: 'plugin guest is unavailable', errorKind: 'unavailable' };
  }

  // Dynamic import + component instantiation can throw (module load, WASM
  // instantiation); convert any throw to a non-fatal error so the caller renders
  // the native fallback rather than hanging on a rejected promise.
  // eslint-disable-next-line functional/no-try-statements -- boundary guard for WASM module load/instantiation
  try {
    const guest = await guestLoader();

    const context = createGraphAccessContext({ graph });
    const executionResult = await executeSandboxedGuestPlugin(
      context,
      token,
      propertiesToJson(contentNode),
      guest,
    );

    if (!executionResult.ok) {
      return { ok: false, error: executionResult.error.message, errorKind: 'execution-error' };
    }

    const outputParse = renderOutputSchema.safeParse(JSON.parse(executionResult.value));
    return !outputParse.success || outputParse.data.html.length === 0
      ? {
          ok: false,
          error: 'plugin returned invalid or empty render output',
          errorKind: 'execution-error',
        }
      : { ok: true, html: outputParse.data.html };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      errorKind: 'execution-error',
    };
  }
};
