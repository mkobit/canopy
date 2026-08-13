import type { Result } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import type { ApiAdapterError } from '../result-errors';
import { createApiAdapterError } from '../result-errors';

export type WasmCapability =
  | 'read:nodes'
  | 'read:edges'
  | 'read:properties'
  | 'read:traversal'
  | 'read:events'
  | 'write:create-node'
  | 'write:update-properties'
  | 'write:delete-node'
  | 'write:create-edge'
  | 'write:delete-edge'
  | 'render:declarative'
  | 'render:raw-html'
  | 'wizard'
  | 'read:*'
  | 'write:*'
  | '*';

// Allowlist of every recognized capability string, source of truth for the type above.
export const KNOWN_WASM_CAPABILITIES = [
  'read:nodes',
  'read:edges',
  'read:properties',
  'read:traversal',
  'read:events',
  'write:create-node',
  'write:update-properties',
  'write:delete-node',
  'write:create-edge',
  'write:delete-edge',
  'render:declarative',
  'render:raw-html',
  'wizard',
  'read:*',
  'write:*',
  '*',
] as const satisfies readonly WasmCapability[];

// Narrows an arbitrary string to a recognized WasmCapability.
export const isWasmCapability = (value: string): value is WasmCapability =>
  (KNOWN_WASM_CAPABILITIES as readonly string[]).includes(value);

export type CapabilityValidator = (token: string, requiredCapability: WasmCapability) => boolean;

// Parses token scopes separated by whitespace or commas.
export const parseTokenScopes = (token: string): readonly string[] =>
  token
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

// Validates whether token matches required capability or wildcard.
export const defaultCapabilityValidator: CapabilityValidator = (
  token: string,
  requiredCapability: WasmCapability,
): boolean => {
  if (!token || token.trim().length === 0) {
    return false;
  }

  const scopes = parseTokenScopes(token);
  if (scopes.includes('*')) {
    return true;
  }

  const [category] = requiredCapability.split(':', 1);
  if (category && scopes.includes(`${category}:*`)) {
    return true;
  }

  return scopes.includes(requiredCapability);
};

// Verifies capability token against required capability scope.
export const verifyCapability = (
  token: string,
  requiredCapability: WasmCapability,
  customValidator?: CapabilityValidator,
): Result<void, ApiAdapterError> => {
  const validator = customValidator ?? defaultCapabilityValidator;
  if (!validator(token, requiredCapability)) {
    return err(
      createApiAdapterError(
        'FORBIDDEN',
        `Capability token does not grant required capability '${requiredCapability}'`,
      ),
    );
  }
  return ok(undefined);
};

// Computes the effective capability scope by intersecting manifest declarations
// with the session-granted scope token. Returns a space-delimited scope string
// (empty when the intersection is empty) suitable for binding into host imports.
export const intersectCapabilities = (
  manifestCapabilities: readonly string[],
  grantedCapabilities: string,
): string =>
  manifestCapabilities
    .filter(
      (capability): capability is WasmCapability =>
        isWasmCapability(capability) && defaultCapabilityValidator(grantedCapabilities, capability),
    )
    .join(' ');
