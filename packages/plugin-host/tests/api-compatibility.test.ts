import { describe, expect, test } from 'bun:test';
import { checkApiCompatibility } from '../../../tools/lib/api-compatibility-checker';
import { CANOPY_WIT_SPECIFICATION } from '../src';

describe('WIT compatibility checker', () => {
  test('passes verification against the unchanged baseline', () => {
    const result = checkApiCompatibility({
      target: 'wit',
      currentWit: CANOPY_WIT_SPECIFICATION,
    });

    expect(result.success).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test('detects function removal and signature changes', () => {
    const modifiedWit = `
      interface host-queries {
        use graph-types.{capability-token, adapter-error};
        query-nodes: func(token: capability-token) -> result<string, adapter-error>;
      }
    `;
    const result = checkApiCompatibility({
      target: 'wit',
      overrideWit: modifiedWit,
    });

    expect(result.success).toBe(false);
    expect(
      result.violations.some(
        (violation) =>
          violation.protocol === 'wit' &&
          (violation.changeType === 'FUNCTION_REMOVAL' ||
            violation.changeType === 'SIGNATURE_CHANGE'),
      ),
    ).toBe(true);
  });
});
