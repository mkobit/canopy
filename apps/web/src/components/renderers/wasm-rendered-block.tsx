import React, { useEffect, useState } from 'react';
import type { Graph, Node } from '@canopy/graph';
import { SanitizedHtmlRenderer } from './sanitized-html-renderer';
import { executeWasmRender } from './execute-wasm-render';
import { getCachedRender, hashContent, renderCacheKey, setCachedRender } from './render-cache';

export type WasmRenderedBlockProperties = Readonly<{
  node: Node;
  graph: Graph;
  // The plugin node the resolver located from the renderer's `entryPoint`.
  pluginNode: Node;
  // Native renderer shown while the plugin render is pending or on failure.
  fallback: React.ReactNode;
}>;

type RenderState =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'ok'; html: string }>
  | Readonly<{ status: 'error' }>;

// De-duplicate failure logging so a broken plugin logs once per key, not per frame.
const loggedFailures = new Set<string>();
const logRenderFailureOnce = (key: string, error: string): void => {
  if (loggedFailures.has(key)) {
    return;
  }
  // eslint-disable-next-line functional/immutable-data -- one-time diagnostic dedupe
  loggedFailures.add(key);
  console.warn(`WASM render failed for ${key}: ${error}`);
};

// Inner block, remounted per cache key. Initial state comes from the cache
// synchronously; the effect only dispatches the async render on a miss, so no
// state is set synchronously inside the effect body.
const WasmRenderInner: React.FC<WasmRenderedBlockProperties & Readonly<{ cacheKey: string }>> = ({
  node,
  graph,
  pluginNode,
  fallback,
  cacheKey,
}) => {
  const [state, setState] = useState<RenderState>(() => {
    const cached = getCachedRender(cacheKey);
    return cached === undefined ? { status: 'pending' } : { status: 'ok', html: cached };
  });

  useEffect(() => {
    if (getCachedRender(cacheKey) !== undefined) {
      return;
    }

    // eslint-disable-next-line functional/no-let -- cancellation flag for superseded renders
    let cancelled = false;

    void (async (): Promise<void> => {
      const result = await executeWasmRender(graph, pluginNode, node);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setCachedRender(cacheKey, result.html);
        setState({ status: 'ok', html: result.html });
      } else {
        logRenderFailureOnce(cacheKey, result.error);
        setState({ status: 'error' });
      }
    })();

    return (): void => {
      cancelled = true;
    };
    // Keyed by cacheKey (node id + content hash); graph/pluginNode stable within a key.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by cacheKey
  }, [cacheKey]);

  // `data-render-status` is an observability signal (never content): the closed
  // shadow root cannot be pierced by the e2e, so this is how the browser test
  // confirms the plugin instantiated, executed, and produced valid output.
  return (
    <div data-testid="wasm-rendered-block" data-render-status={state.status}>
      {state.status === 'ok' ? (
        <SanitizedHtmlRenderer html={state.html} />
      ) : (
        // Pending and error both render the native fallback (never unvalidated output).
        fallback
      )}
    </div>
  );
};

// Two-phase async WASM render. Plugin execution is a Promise but block rendering
// is synchronous, so execution is dispatched in an effect keyed by (node id,
// content hash); the native fallback shows while pending or on failure, and a
// superseded result (content changed mid-flight) is discarded via remount rather
// than mounted. The inner component is remounted on cache-key change so per-key
// state resets cleanly without setting state synchronously inside an effect.
export const WasmRenderedBlock: React.FC<WasmRenderedBlockProperties> = (properties) => {
  const cacheKey = renderCacheKey(properties.node.id, hashContent(properties.node));
  return <WasmRenderInner key={cacheKey} cacheKey={cacheKey} {...properties} />;
};
