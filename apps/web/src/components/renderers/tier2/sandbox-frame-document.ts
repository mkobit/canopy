// Opaque-origin Tier-2 frame document builder. The frame runs untrusted
// interactive plugin output walled off from the host realm (design decision 4):
// `sandbox="allow-scripts"` with `allow-same-origin` OMITTED forces a null
// origin, `allow=""` denies every Permissions-Policy feature, and an in-document
// meta-CSP pins the full restrictive directive set (a srcdoc frame otherwise
// inherits the parent policy).

// The ONLY sandbox token. `allow-same-origin` is deliberately absent: combined
// with `allow-scripts` it would let the frame delete its own sandbox and reach
// the parent origin. `allow-forms`/`allow-modals`/`allow-popups`/
// `allow-top-navigation` are likewise absent.
export const TIER2_SANDBOX_TOKENS = 'allow-scripts';

// Empty Permissions-Policy: denies camera, microphone, geolocation, clipboard,
// fullscreen, pointer-lock, etc. Sandbox flags and Permissions-Policy are
// orthogonal; without this the frame inherits features the host document holds
// (finding 3).
export const TIER2_FRAME_ALLOW = '';

// Full restrictive CSP. `default-src 'none'` denies everything not re-enabled;
// `form-action`/`frame-ancestors` have no `default-src` fallback so they are
// listed explicitly (finding 10). `script-src`/`style-src` re-enable the frame's
// OWN inline logic and `wasm-unsafe-eval` for an interactive WASM visualizer;
// `img-src data:` permits inline images. `connect-src 'none'` blocks
// fetch/XHR/WebSocket/beacon (self-navigation exfil is a documented residual,
// decision 4a — not claimed closed here).
export const TIER2_FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// The exact directive set a guard asserts is present (task 3.2).
export const TIER2_REQUIRED_CSP_DIRECTIVES: readonly string[] = [
  "default-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

// Bridge bootstrap injected into every frame: announces `ready` to the host
// keyed by the per-frame nonce, and ignores host→frame messages that do not
// carry the matching nonce (a stale message for a prior occupant, finding 8).
// The guest's own scripts run alongside this; the opaque origin + enumerated
// host-side handler are what contain a hostile guest, not this bootstrap.
const bridgeBootstrap = (nonce: string): string =>
  [
    `(function(){`,
    `var N=${JSON.stringify(nonce)};`,
    `window.addEventListener('message',function(e){`,
    `if(!e.data||e.data.nonce!==N)return;`,
    `});`,
    `try{parent.postMessage({nonce:N,kind:'ready'},'*');}catch(_){}`,
    `})();`,
  ].join('');

// Builds the full srcdoc document string for a Tier-2 frame. The guest body is
// inserted verbatim — Tier-2 deliberately PRESERVES the guest's live scripts
// (that is the privilege `render:interactive` conveys); the opaque null origin,
// the meta-CSP, and the empty sandbox/`allow` set are what contain it. The bridge
// bootstrap runs as a separate trailing script, independent of any guest error.
export const buildTier2FrameDocument = (bodyHtml: string, nonce: string): string =>
  [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${TIER2_FRAME_CSP}">`,
    '</head><body>',
    bodyHtml,
    `<script>${bridgeBootstrap(nonce)}</script>`,
    '</body></html>',
  ].join('');
