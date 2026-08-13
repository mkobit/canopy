import { describe, expect, it } from 'bun:test';
import {
  KNOWN_WASM_CAPABILITIES,
  defaultCapabilityValidator,
  intersectCapabilities,
  isWasmCapability,
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

  describe('isWasmCapability', () => {
    it('recognizes every known capability string', () => {
      for (const capability of KNOWN_WASM_CAPABILITIES) {
        expect(isWasmCapability(capability)).toBe(true);
      }
    });

    it('recognizes the expanded render capabilities', () => {
      expect(isWasmCapability('render:declarative')).toBe(true);
      expect(isWasmCapability('render:raw-html')).toBe(true);
    });

    it('rejects unknown capability strings', () => {
      expect(isWasmCapability('invalid:capability')).toBe(false);
      expect(isWasmCapability('')).toBe(false);
    });
  });

  describe('intersectCapabilities', () => {
    it('attenuates manifest capabilities against a wildcard-category grant', () => {
      expect(intersectCapabilities(['read:nodes', 'write:create-node'], 'read:*')).toBe(
        'read:nodes',
      );
    });

    it('retains all manifest capabilities under a global grant', () => {
      expect(intersectCapabilities(['read:nodes', 'write:create-node'], '*')).toBe(
        'read:nodes write:create-node',
      );
    });

    it('produces an empty scope when the intersection is empty', () => {
      expect(intersectCapabilities(['write:create-node'], 'read:*')).toBe('');
    });

    it('drops unrecognized manifest capability strings', () => {
      expect(intersectCapabilities(['read:nodes', 'invalid:capability'], '*')).toBe('read:nodes');
    });
  });
});
