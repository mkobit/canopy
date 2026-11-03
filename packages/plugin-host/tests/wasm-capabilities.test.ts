import { describe, expect, it } from 'bun:test';
import {
  KNOWN_WASM_CAPABILITIES,
  SENSITIVE_WASM_CAPABILITIES,
  defaultCapabilityValidator,
  grantsCapabilityExplicitly,
  intersectCapabilities,
  isSensitiveCapability,
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
      expect(defaultCapabilityValidator('write:create-node', 'write:create-node')).toBe(true);
      expect(defaultCapabilityValidator('render:interactive', 'render:interactive')).toBe(true);
      expect(defaultCapabilityValidator('network:connect', 'network:connect')).toBe(true);
    });

    it('supports wildcard category matching for non-sensitive capabilities', () => {
      expect(defaultCapabilityValidator('read:*', 'read:nodes')).toBe(true);
      expect(defaultCapabilityValidator('read:*', 'read:edges')).toBe(true);
      expect(defaultCapabilityValidator('read:*', 'write:create-node')).toBe(false);
      expect(defaultCapabilityValidator('render:*', 'render:declarative')).toBe(true);
    });

    it('rejects wildcard category matching for all sensitive capabilities', () => {
      expect(defaultCapabilityValidator('write:*', 'write:create-node')).toBe(false);
      expect(defaultCapabilityValidator('write:*', 'write:update-properties')).toBe(false);
      expect(defaultCapabilityValidator('write:*', 'write:delete-node')).toBe(false);
      expect(defaultCapabilityValidator('write:*', 'write:create-edge')).toBe(false);
      expect(defaultCapabilityValidator('write:*', 'write:delete-edge')).toBe(false);
      expect(defaultCapabilityValidator('render:*', 'render:interactive')).toBe(false);
      expect(defaultCapabilityValidator('network:*', 'network:connect')).toBe(false);
    });

    it('supports global wildcard token for non-sensitive capabilities only', () => {
      expect(defaultCapabilityValidator('*', 'read:nodes')).toBe(true);
      expect(defaultCapabilityValidator('*', 'read:edges')).toBe(true);
      expect(defaultCapabilityValidator('*', 'render:declarative')).toBe(true);
    });

    it('rejects global wildcard token for all sensitive capabilities', () => {
      expect(defaultCapabilityValidator('*', 'write:create-node')).toBe(false);
      expect(defaultCapabilityValidator('*', 'write:update-properties')).toBe(false);
      expect(defaultCapabilityValidator('*', 'write:delete-node')).toBe(false);
      expect(defaultCapabilityValidator('*', 'write:create-edge')).toBe(false);
      expect(defaultCapabilityValidator('*', 'write:delete-edge')).toBe(false);
      expect(defaultCapabilityValidator('*', 'render:interactive')).toBe(false);
      expect(defaultCapabilityValidator('*', 'network:connect')).toBe(false);
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
      if (result.ok) {
        return;
      }

      expect(result.error.category).toBe('FORBIDDEN');
      expect(result.error.message).toContain('write:create-node');
    });

    it('returns FORBIDDEN error when wildcard tokens are used for sensitive capabilities', () => {
      const globalWildcardResult = verifyCapability('*', 'write:create-node');
      expect(globalWildcardResult.ok).toBe(false);
      if (!globalWildcardResult.ok) {
        expect(globalWildcardResult.error.category).toBe('FORBIDDEN');
      }

      const categoryWildcardResult = verifyCapability('write:*', 'write:delete-edge');
      expect(categoryWildcardResult.ok).toBe(false);
      if (!categoryWildcardResult.ok) {
        expect(categoryWildcardResult.error.category).toBe('FORBIDDEN');
      }

      const renderWildcardResult = verifyCapability('render:*', 'render:interactive');
      expect(renderWildcardResult.ok).toBe(false);
      if (!renderWildcardResult.ok) {
        expect(renderWildcardResult.error.category).toBe('FORBIDDEN');
      }
    });

    it('returns ok for explicit literal grant of sensitive capabilities', () => {
      expect(verifyCapability('write:create-node', 'write:create-node').ok).toBe(true);
      expect(verifyCapability('render:interactive', 'render:interactive').ok).toBe(true);
      expect(verifyCapability('network:connect', 'network:connect').ok).toBe(true);
    });

    it('uses custom validator when provided', () => {
      expect(verifyCapability('super-secret', 'read:nodes', customValidator).ok).toBe(true);
      expect(verifyCapability('invalid', 'read:nodes', customValidator).ok).toBe(false);
    });
  });

  describe('SENSITIVE_WASM_CAPABILITIES and isSensitiveCapability', () => {
    it('contains all required sensitive capabilities', () => {
      const expectedSensitive = [
        'render:interactive',
        'network:connect',
        'write:create-node',
        'write:update-properties',
        'write:delete-node',
        'write:create-edge',
        'write:delete-edge',
      ];
      expect(SENSITIVE_WASM_CAPABILITIES.size).toBe(expectedSensitive.length);
      for (const cap of expectedSensitive) {
        expect(
          SENSITIVE_WASM_CAPABILITIES.has(cap as (typeof KNOWN_WASM_CAPABILITIES)[number]),
        ).toBe(true);
        expect(isSensitiveCapability(cap)).toBe(true);
      }
    });

    it('rejects non-sensitive capabilities from the sensitive set', () => {
      expect(isSensitiveCapability('read:nodes')).toBe(false);
      expect(isSensitiveCapability('read:edges')).toBe(false);
      expect(isSensitiveCapability('read:properties')).toBe(false);
      expect(isSensitiveCapability('read:traversal')).toBe(false);
      expect(isSensitiveCapability('read:events')).toBe(false);
      expect(isSensitiveCapability('render:declarative')).toBe(false);
      expect(isSensitiveCapability('render:raw-html')).toBe(false);
      expect(isSensitiveCapability('wizard')).toBe(false);
      expect(isSensitiveCapability('*')).toBe(false);
      expect(isSensitiveCapability('write:*')).toBe(false);
      expect(isSensitiveCapability('read:*')).toBe(false);
    });
  });

  describe('isWasmCapability', () => {
    it('recognizes every known capability string', () => {
      for (const capability of KNOWN_WASM_CAPABILITIES) {
        expect(isWasmCapability(capability)).toBe(true);
      }
    });

    it('recognizes network:connect and expanded render capabilities', () => {
      expect(isWasmCapability('network:connect')).toBe(true);
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

    it('retains non-sensitive capabilities under a global grant but rejects sensitive capabilities without literal grant', () => {
      expect(intersectCapabilities(['read:nodes', 'write:create-node'], '*')).toBe('read:nodes');
      expect(
        intersectCapabilities(['read:nodes', 'write:create-node'], '* write:create-node'),
      ).toBe('read:nodes write:create-node');
    });

    it('produces an empty scope when the intersection is empty', () => {
      expect(intersectCapabilities(['write:create-node'], 'read:*')).toBe('');
    });

    it('drops unrecognized manifest capability strings', () => {
      expect(intersectCapabilities(['read:nodes', 'invalid:capability'], '*')).toBe('read:nodes');
    });

    it('does not let a forged wildcard exceed the manifest intersection', () => {
      const effectiveToken = intersectCapabilities(['read:nodes', 'write:create-node'], 'read:*');
      expect(effectiveToken).toBe('read:nodes');
      expect(defaultCapabilityValidator(effectiveToken, 'read:nodes')).toBe(true);
      expect(defaultCapabilityValidator(effectiveToken, 'write:create-node')).toBe(false);
      expect(defaultCapabilityValidator('*', 'write:create-node')).toBe(false);
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
