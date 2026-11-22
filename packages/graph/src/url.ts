import type { Result } from './result';
import { ok, err as error, fromThrowable } from './result';

export type UriError = Readonly<{
  code: 'INVALID_URL' | 'DISALLOWED_SCHEME' | 'EMBEDDED_CREDENTIALS' | 'URI_TOO_LONG';
  message: string;
}>;

const MAX_URI_LENGTH = 8192;
const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:', 'canopy:', 'mailto:']);

/**
Validates and canonicalizes an absolute URI.
Enforces scheme allowlist, rejects embedded credentials and URIs > 8192 characters,
and strips trailing empty `?` or `#` without mutating URL fields.
*/
export function canonicalizeUri(raw: string): Result<string, UriError> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return error({
      code: 'INVALID_URL',
      message: 'URI must not be empty',
    });
  }

  if (trimmed.length > MAX_URI_LENGTH) {
    return error({
      code: 'URI_TOO_LONG',
      message: `URI exceeds maximum length of ${MAX_URI_LENGTH} characters`,
    });
  }

  const parsedResult = fromThrowable(() => new URL(trimmed));
  if (!parsedResult.ok) {
    return error({
      code: 'INVALID_URL',
      message: `Invalid URI: '${trimmed}'`,
    });
  }

  const parsed = parsedResult.value;
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return error({
      code: 'DISALLOWED_SCHEME',
      message: `Disallowed URI scheme '${parsed.protocol}'`,
    });
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return error({
      code: 'EMBEDDED_CREDENTIALS',
      message: 'URI must not contain embedded credentials',
    });
  }

  const withoutEmptyHash =
    parsed.hash === '' && parsed.href.endsWith('#') ? parsed.href.slice(0, -1) : parsed.href;
  const canonical =
    parsed.search === '' && withoutEmptyHash.endsWith('?')
      ? withoutEmptyHash.slice(0, -1)
      : withoutEmptyHash;

  return ok(canonical);
}
