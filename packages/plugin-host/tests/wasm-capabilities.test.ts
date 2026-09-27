import { describe, expect, it } from 'bun:test';
import {
  KNOWN_WASM_CAPABILITIES,
  defaultCapabilityValidator,
  grantsCapabilityExplicitly,
  intersectCapabilities,
  isWasmCapability,
  parseTokenScopes,
  resolveRenderTier,
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
      expect(isWasmCapability('render:interactive')).toBe(true);
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

  // Tier-2 interactive rendering is a privilege that a broad wildcard grant must
  // NOT silently convey (design decision 2 / adversarial finding 5). Unlike
  // `defaultCapabilityValidator`, the explicit-grant gate never expands wildcards.
  describe('grantsCapabilityExplicitly (wildcard non-conveyance)', () => {
    it('accepts a literal, non-wildcard grant of the capability', () => {
      expect(grantsCapabilityExplicitly('render:interactive', 'render:interactive')).toBe(true);
      expect(
        grantsCapabilityExplicitly('render:raw-html render:interactive', 'render:interactive'),
      ).toBe(true);
    });

    it('rejects a category wildcard grant', () => {
      expect(grantsCapabilityExplicitly('render:*', 'render:interactive')).toBe(false);
    });

    it('rejects a global wildcard grant', () => {
      expect(grantsCapabilityExplicitly('*', 'render:interactive')).toBe(false);
    });

    it('rejects an empty or unrelated grant', () => {
      expect(grantsCapabilityExplicitly('', 'render:interactive')).toBe(false);
      expect(grantsCapabilityExplicitly('render:raw-html', 'render:interactive')).toBe(false);
    });
  });

  describe('resolveRenderTier', () => {
    it('routes an explicit render:interactive grant to Tier-2', () => {
      expect(resolveRenderTier('render:interactive')).toBe('tier2');
    });

    it('forces Tier-2 when both raw-html and interactive are granted', () => {
      expect(resolveRenderTier('render:raw-html render:interactive')).toBe('tier2');
    });

    it('does NOT route a render:* wildcard grant to Tier-2', () => {
      expect(resolveRenderTier('render:*')).toBe('tier1');
    });

    it('does NOT route a global * grant to Tier-2', () => {
      expect(resolveRenderTier('*')).toBe('tier1');
    });

    it('keeps a raw-html-only grant on Tier-1', () => {
      expect(resolveRenderTier('render:raw-html')).toBe('tier1');
    });
  });
});
