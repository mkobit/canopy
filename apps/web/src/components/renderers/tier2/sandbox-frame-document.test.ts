import { describe, it, expect } from 'bun:test';
import {
  buildTier2FrameDocument,
  TIER2_FRAME_ALLOW,
  TIER2_FRAME_CSP,
  TIER2_REQUIRED_CSP_DIRECTIVES,
  TIER2_SANDBOX_TOKENS,
} from './sandbox-frame-document';

describe('Tier-2 sandbox configuration guards', () => {
  it('never includes allow-same-origin in the sandbox token list', () => {
    expect(TIER2_SANDBOX_TOKENS).toBe('allow-scripts');
    expect(TIER2_SANDBOX_TOKENS.split(/\s+/)).not.toContain('allow-same-origin');
  });

  it('omits the escalation tokens allow-forms/modals/popups/top-navigation', () => {
    const tokens = TIER2_SANDBOX_TOKENS.split(/\s+/);
    for (const forbidden of [
      'allow-same-origin',
      'allow-forms',
      'allow-modals',
      'allow-popups',
      'allow-top-navigation',
    ]) {
      expect(tokens).not.toContain(forbidden);
    }
  });

  it('uses an empty Permissions-Policy allow attribute', () => {
    expect(TIER2_FRAME_ALLOW).toBe('');
  });

  it('pins the full restrictive CSP directive set', () => {
    for (const directive of TIER2_REQUIRED_CSP_DIRECTIVES) {
      expect(TIER2_FRAME_CSP).toContain(directive);
    }
  });

  it('permits inline script and wasm-unsafe-eval for the frame own logic', () => {
    expect(TIER2_FRAME_CSP).toContain("script-src 'unsafe-inline' 'wasm-unsafe-eval'");
  });
});

describe('buildTier2FrameDocument', () => {
  it('embeds the meta CSP and the per-frame nonce', () => {
    const document = buildTier2FrameDocument('<p>hi</p>', 'deadbeef');
    expect(document).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(document).toContain(TIER2_FRAME_CSP);
    expect(document).toContain('"deadbeef"');
    expect(document).toContain('<p>hi</p>');
  });

  it('preserves the guest live scripts verbatim (Tier-2 keeps scripts)', () => {
    const document = buildTier2FrameDocument('<script>run()</script><p>x</p>', 'n');
    // Tier-2 preserves scripts — isolation is the opaque origin + CSP, not escaping.
    expect(document).toContain('<script>run()</script>');
    // The bridge bootstrap is a separate trailing script after the guest body.
    expect(document.indexOf('<p>x</p>')).toBeLessThan(document.lastIndexOf('<script>'));
  });
});
