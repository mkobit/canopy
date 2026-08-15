import { describe, expect, it } from 'bun:test';
import { sanitizeStyleValue } from './sanitize-html';

// DOMPurify's element/attribute sanitization (script + event-handler stripping,
// id/name clobbering defense) cannot be faithfully unit-tested under happy-dom,
// whose DOMParser mangles the tree DOMPurify operates on. That path is verified
// end-to-end in the Playwright e2e (real browser). Here we unit-test the pure
// CSS policy, which is plain string logic independent of the DOM.
describe('sanitizeStyleValue', () => {
  it('removes positioning declarations, keeps safe ones', () => {
    const out = sanitizeStyleValue('position: fixed; z-index: 999; color: red');
    expect(out).not.toContain('position');
    expect(out).not.toContain('z-index');
    expect(out).toContain('color: red');
  });

  it('removes external url() references, keeps safe ones', () => {
    const out = sanitizeStyleValue('background: url(https://evil.example/x.png); color: blue');
    expect(out).not.toContain('url(');
    expect(out).toContain('color: blue');
  });

  it('returns empty when every declaration is stripped', () => {
    expect(sanitizeStyleValue('position: absolute')).toBe('');
    expect(sanitizeStyleValue('position: fixed; z-index: 5')).toBe('');
    expect(sanitizeStyleValue('background: url(https://evil.example/x.png)')).toBe('');
  });
});
