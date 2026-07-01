import { describe, it, expect } from 'bun:test';
import { RESTRICTED_NAMESPACE_KINDS } from './namespace';

describe('RESTRICTED_NAMESPACE_KINDS', () => {
  it('restricts the system kind', () => {
    expect(RESTRICTED_NAMESPACE_KINDS.has('system')).toBe(true);
  });

  it('does not restrict user-authored kinds', () => {
    expect(RESTRICTED_NAMESPACE_KINDS.has('user')).toBe(false);
    expect(RESTRICTED_NAMESPACE_KINDS.has('imported')).toBe(false);
    expect(RESTRICTED_NAMESPACE_KINDS.has('user-settings')).toBe(false);
  });
});
