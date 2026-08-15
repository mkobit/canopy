import type { WasmGuestPlugin } from '@canopy/api-adapter';

// Guests the render worker is allowed to run, keyed by a stable id the main
// thread names in its `execute` request. Functions cannot cross `postMessage`,
// so the worker resolves the guest from this registry rather than receiving it.
//
// The first-party Markdown guest is deliberately absent: it is trusted and stays
// on its unchanged Tier-1 inline path (never the worker). Only untrusted,
// grant-gated interactive guests run here. Until a real third-party install flow
// exists, the sole entry is the isolation-proof fixture used by the Tier-2 e2e.

// Fixture interactive guest. Returns HTML that, if it ever reached the host
// realm, would attempt a host takeover — the whole point of the Tier-2 e2e is
// that the opaque-origin frame prevents that. The guest itself is pure
// input→HTML and never touches host bindings.
const readLabel = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'label' in value && typeof value.label === 'string'
    ? value.label
    : 'sandboxed plugin';

const interactiveFixtureGuest: WasmGuestPlugin = (_hostBindings, inputJson): string => {
  const parsed: unknown = JSON.parse(inputJson);
  const label = readLabel(parsed);
  const html = [
    `<main data-fixture="interactive">`,
    `<p id="fixture-label">${label}</p>`,
    `<script>`,
    // Hostile probes: try to reach the host, exfiltrate, and impersonate host UI.
    // All must be contained by the opaque origin + CSP + sandbox.
    `try { window.parent.__pwned = true; } catch (e) {}`,
    `try { top.__pwned = true; } catch (e) {}`,
    `document.getElementById('fixture-label').setAttribute('data-ran','1');`,
    `parent.postMessage({ kind: 'ready' }, '*');`,
    `</script>`,
    `</main>`,
  ].join('');
  return JSON.stringify({ html });
};

export const WORKER_GUESTS: ReadonlyMap<string, WasmGuestPlugin> = new Map<string, WasmGuestPlugin>(
  [['fixture:interactive', interactiveFixtureGuest]],
);
