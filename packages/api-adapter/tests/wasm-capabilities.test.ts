import { describe, expect, it } from 'bun:test';
import {
  defaultCapabilityValidator,
  parseTokenScopes,
  verifyCapability,
} from '../src/wasm/capabilities';

const customValidator = (token: string): boolean => token === 'super-secret';

describe('WASM Capability Security Token Validation', () => {
  describe('parseTokenScopes', () => {
    it('parses comma and whitespace separated scope strings', () => {
      const scopes = parseTokenScopes('read:nodes, write:create-node   read:edges');
      expect(scopes).toEqual(['read:nodes', 'write:create-node', 'read:edges']);
    });
  });

  describe('defaultCapabilityValidator', () => {
    it('rejects empty or whitespace tokens', () => {
      expect(defaultCapabilityValidator('', 'read:nodes')).toBe(false);
      expect(defaultCapabilityValidator(' '.repeat(3), 'read:nodes')).toBe(false);
    });

    it('validates exact capability match', () => {
      expect(defaultCapabilityValidator('read:nodes', 'read:nodes')).toBe(true);
      expect(defaultCapabilityValidator('read:nodes', 'read:edges')).toBe(false);
    });

    it('supports wildcard category matching', () => {
      expect(defaultCapabilityValidator('read:*', 'read:nodes')).toBe(true);
      expect(defaultCapabilityValidator('read:*', 'read:edges')).toBe(true);
      expect(defaultCapabilityValidator('read:*', 'write:create-node')).toBe(false);
      expect(defaultCapabilityValidator('write:*', 'write:create-node')).toBe(true);
    });

    it('supports global wildcard token', () => {
      expect(defaultCapabilityValidator('*', 'read:nodes')).toBe(true);
      expect(defaultCapabilityValidator('*', 'write:delete-node')).toBe(true);
    });
  });

  describe('verifyCapability', () => {
    it('returns ok for valid capability token', () => {
      const result = verifyCapability('read:nodes', 'read:nodes');
      expect(result.ok).toBe(true);
    });

    it('returns FORBIDDEN error for invalid capability token', () => {
      const result = verifyCapability('read:nodes', 'write:create-node');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('FORBIDDEN');
        expect(result.error.message).toContain('write:create-node');
      }
    });

    it('uses custom validator when provided', () => {
      expect(verifyCapability('super-secret', 'read:nodes', customValidator).ok).toBe(true);
      expect(verifyCapability('invalid', 'read:nodes', customValidator).ok).toBe(false);
    });
  });
});
