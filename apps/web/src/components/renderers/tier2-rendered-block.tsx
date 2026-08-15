import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Graph, Node } from '@canopy/graph';
import { createApiAdapterContext } from '@canopy/api-adapter';
import { executeSandboxedGuestPluginInWorker } from './execute-wasm-render-worker';
import { getCachedRender, hashContent, renderCacheKey, setCachedRender } from './render-cache';
import {
  buildTier2FrameDocument,
  TIER2_FRAME_ALLOW,
  TIER2_SANDBOX_TOKENS,
} from './tier2/sandbox-frame-document';
import { createFrameBridge, generateFrameNonce } from './tier2/frame-bridge';
import { acquireFrameSlot, releaseFrameSlot } from './tier2/frame-budget';

export type Tier2RenderedBlockProperties = Readonly<{
  node: Node;
  graph: Graph;
  pluginNode: Node;
  // The worker-guest id resolved for this plugin (the guest the render worker runs).
  guestId: string;
  // Effective granted scope — carries the explicit `render:interactive` grant.
  token: string;
  // Native renderer shown while pending, off-screen, over budget, or on failure.
  fallback: React.ReactNode;
}>;

// How long a mounted frame has to post its `ready` handshake before the host
// tears it down and shows the static preview (design: frame mount deadline).
const FRAME_MOUNT_DEADLINE_MS = 3000;

type RenderState =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'ready'; html: string }>
  | Readonly<{ status: 'error' }>;

// Data minimization (design decision 4a / finding 1): only the single content
// node's own properties enter the frame, never broad graph or query data.
const contentToInput = (node: Node): string => JSON.stringify(Object.fromEntries(node.properties));

const loggedFailures = new Set<string>();
const logFailureOnce = (key: string, error: string): void => {
  if (loggedFailures.has(key)) return;
  // eslint-disable-next-line functional/immutable-data -- one-time diagnostic dedupe
  loggedFailures.add(key);
  console.warn(`Tier-2 render failed for ${key}: ${error}`);
};

// Persistent "sandboxed plugin" affordance (design decision 9 / finding 11):
// distinguishes untrusted plugin output from host chrome so a plugin cannot
// convincingly impersonate host UI inside its rect.
const affordanceStyle: React.CSSProperties = {
  border: '2px solid #b45309',
  borderRadius: '4px',
  position: 'relative',
};

const badge = (
  <span
    aria-hidden="true"
    style={{
      position: 'absolute',
      top: 0,
      right: 0,
      fontSize: '10px',
      lineHeight: '14px',
      padding: '0 4px',
      background: '#b45309',
      color: 'white',
      borderBottomLeftRadius: '4px',
      zIndex: 1,
    }}
  >
    sandboxed plugin
  </span>
);

// Virtualize: report whether the block is in the viewport so only in-viewport
// blocks hold a live frame (design decision 6). Assumes visible where
// IntersectionObserver is unavailable (SSR/tests).
const useVisibility = (reference: React.RefObject<HTMLElement | null>): boolean => {
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = reference.current;
    if (element === null || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setVisible(entry.isIntersecting);
    });
    observer.observe(element);
    return (): void => observer.disconnect();
  }, [reference]);
  return visible;
};

// Run the untrusted guest through the terminable worker once per cache key and
// cache the HTML output; a superseded (cancelled) render is discarded.
const useTier2Output = (
  cacheKey: string,
  graph: Graph,
  node: Node,
  token: string,
  guestId: string,
): RenderState => {
  const [state, setState] = useState<RenderState>(() => {
    const cached = getCachedRender(cacheKey);
    return cached === undefined ? { status: 'pending' } : { status: 'ready', html: cached };
  });
  useEffect(() => {
    if (getCachedRender(cacheKey) !== undefined) return undefined;
    // eslint-disable-next-line functional/no-let -- cancellation flag for superseded renders
    let cancelled = false;
    void (async (): Promise<void> => {
      const result = await executeSandboxedGuestPluginInWorker(
        createApiAdapterContext({ graph }),
        token,
        contentToInput(node),
        guestId,
      );
      if (cancelled) return;
      if (result.ok) {
        setCachedRender(cacheKey, result.value);
        setState({ status: 'ready', html: result.value });
      } else {
        logFailureOnce(cacheKey, result.error.message);
        setState({ status: 'error' });
      }
    })();
    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by cacheKey
  }, [cacheKey]);
  return state;
};

const Tier2Inner: React.FC<Tier2RenderedBlockProperties & Readonly<{ cacheKey: string }>> = ({
  node,
  graph,
  guestId,
  token,
  fallback,
  cacheKey,
}) => {
  const [frameReady, setFrameReady] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [hasSlot, setHasSlot] = useState(false);
  const iframeReference = useRef<HTMLIFrameElement | null>(null);
  const containerReference = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line functional/prefer-tacit -- react-hooks/use-memo requires an inline function
  const nonce = useMemo(() => generateFrameNonce(), []);
  const isVisible = useVisibility(containerReference);
  const state = useTier2Output(cacheKey, graph, node, token, guestId);

  const html = state.status === 'ready' ? state.html : undefined;
  const live = html !== undefined && hasSlot && !gaveUp;

  // Acquire a live-frame budget slot only when output is ready, in-viewport, and
  // not given up; release on unmount, scroll-out, or give-up.
  useEffect(() => {
    if (gaveUp || !isVisible || state.status !== 'ready') return undefined;
    const granted = acquireFrameSlot();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflect external frame-budget reservation into render
    setHasSlot(granted);
    return (): void => {
      setHasSlot(false);
      if (granted) releaseFrameSlot();
    };
  }, [state.status, gaveUp, isVisible]);

  // Bridge + mount deadline for the live frame. If the frame never posts `ready`
  // before the deadline, give up: unmount it (releasing its slot) and keep the
  // static preview (task 3.7).
  useEffect(() => {
    if (!live) return undefined;
    const bridge = createFrameBridge(nonce, () => iframeReference.current?.contentWindow, {
      onReady: () => setFrameReady(true),
    });
    const onMessage = (event: MessageEvent<unknown>): void => {
      bridge.handleMessage({ source: event.source, data: event.data });
    };
    window.addEventListener('message', onMessage);
    const deadline = setTimeout(() => {
      if (!frameReady) setGaveUp(true);
    }, FRAME_MOUNT_DEADLINE_MS);
    return (): void => {
      window.removeEventListener('message', onMessage);
      clearTimeout(deadline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by cacheKey + live
  }, [live, cacheKey]);

  const sourceDocument = useMemo(
    () => (html === undefined ? undefined : buildTier2FrameDocument(html, nonce)),
    [html, nonce],
  );

  // Live frame: opaque-origin iframe with the sandboxed-plugin affordance. The
  // static preview (off-screen, over budget, pending, given-up, or failed) is
  // real, selectable host DOM — never the live interactive HTML inlined.
  return (
    <div
      ref={containerReference}
      data-testid="tier2-rendered-block"
      data-render-status={state.status}
      style={affordanceStyle}
    >
      {badge}
      {live && sourceDocument !== undefined ? (
        <iframe
          ref={iframeReference}
          data-testid="tier2-frame"
          title="Sandboxed plugin output"
          sandbox={TIER2_SANDBOX_TOKENS}
          allow={TIER2_FRAME_ALLOW}
          srcDoc={sourceDocument}
          style={{ width: '100%', border: 'none', display: 'block' }}
        />
      ) : null}
      {live && frameReady ? null : <div data-testid="tier2-static-preview">{fallback}</div>}
    </div>
  );
};

// Parallels `WasmRenderedBlock`: remounted per (node id, content hash) cache key
// so a superseded render (content changed mid-flight) is discarded via remount —
// a fresh iframe element (cleared `window.name`/history) with a fresh nonce.
export const Tier2RenderedBlock: React.FC<Tier2RenderedBlockProperties> = (properties) => {
  const cacheKey = renderCacheKey(properties.node.id, hashContent(properties.node));
  return <Tier2Inner key={cacheKey} cacheKey={cacheKey} {...properties} />;
};
