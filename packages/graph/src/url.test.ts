import { describe, it, expect } from 'bun:test';
import { canonicalizeUri } from './url';

describe('canonicalizeUri', () => {
  it('accepts and canonicalizes allowlisted schemes', () => {
    expect(canonicalizeUri('  https://example.com/path  ')).toEqual({
      ok: true,
      value: 'https://example.com/path',
    });
    expect(canonicalizeUri('https://example.com/?#')).toEqual({
      ok: true,
      value: 'https://example.com/',
    });
    expect(canonicalizeUri('https://example.com/?a=1#')).toEqual({
      ok: true,
      value: 'https://example.com/?a=1',
    });
    expect(canonicalizeUri('canopy://graph/123')).toEqual({
      ok: true,
      value: 'canopy://graph/123',
    });
    expect(canonicalizeUri('mailto:user@example.com')).toEqual({
      ok: true,
      value: 'mailto:user@example.com',
    });
  });

  it('rejects disallowed schemes', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>',
      'file:///etc/passwd',
      'vbscript:msgbox(1)',
      'blob:https://example.com/123',
    ]) {
      const result = canonicalizeUri(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DISALLOWED_SCHEME');
      }
    }
  });

  it('rejects embedded credentials', () => {
    const withUserPass = canonicalizeUri('https://user:pass@example.com/');
    expect(withUserPass.ok).toBe(false);
    if (!withUserPass.ok) {
      expect(withUserPass.error.code).toBe('EMBEDDED_CREDENTIALS');
    }

    const withUserOnly = canonicalizeUri('https://user@example.com/');
    expect(withUserOnly.ok).toBe(false);
    if (!withUserOnly.ok) {
      expect(withUserOnly.error.code).toBe('EMBEDDED_CREDENTIALS');
    }
  });

  it('rejects empty, invalid, and oversized URIs', () => {
    const empty = canonicalizeUri(' '.repeat(3));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe('INVALID_URL');

    const relative = canonicalizeUri('/relative/path');
    expect(relative.ok).toBe(false);
    if (!relative.ok) expect(relative.error.code).toBe('INVALID_URL');

    const tooLong = canonicalizeUri(`https://example.com/${'a'.repeat(8200)}`);
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error.code).toBe('URI_TOO_LONG');
  });
});
