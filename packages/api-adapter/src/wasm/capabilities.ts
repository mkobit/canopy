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
  | 'read:*'
  | 'write:*'
  | '*';

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
