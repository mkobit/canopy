const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function getIndex(char: string | undefined): number {
  if (char === undefined) return -1;
  return DIGITS.indexOf(char);
}

function findPrefixExtensionKey(a: string, b: string, index: number): string {
  if (index < b.length && b[index] === DIGITS.at(0)) {
    return findPrefixExtensionKey(a, b, index + 1);
  }
  const zeros = b.slice(a.length, index);
  const charAt = b[index];
  const valueAt = getIndex(charAt);
  const midValue = Math.floor(valueAt / 2);
  const midChar = DIGITS[midValue];
  if (!midChar) {
    return a + zeros + (DIGITS.at(0) ?? '0');
  }
  return a + zeros + midChar;
}

function findKeyBetween(a: string, b: string, index: number): string {
  const charA = a[index];
  const charB = b[index];

  const valueA = charA ? getIndex(charA) : -1;
  const valueB = charB ? getIndex(charB) : -1;

  if (charA !== undefined && charB !== undefined) {
    if (valueA === valueB) {
      return findKeyBetween(a, b, index + 1);
    }

    const diff = valueB - valueA;
    if (diff > 1) {
      const mid = Math.round((valueA + valueB) / 2);
      return a.slice(0, index) + (DIGITS[mid] ?? '');
    }
    return a.slice(0, index + 1) + (DIGITS.at(Math.floor(DIGITS.length / 2)) ?? '');
  }

  if (charA === undefined) {
    return findPrefixExtensionKey(a, b, index);
  }

  // eslint-disable-next-line functional/no-throw-statements
  throw new Error('generateKeyBetween: unreachable');
}

/**
 * Generates a sort key lexicographically between two keys.
 * Keys use the base62 alphabet.
 */
export function generateKeyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    // eslint-disable-next-line functional/no-throw-statements
    throw new Error(`a (${a}) must be less than b (${b})`);
  }

  // Handle nulls
  if (a === null && b === null) {
    return 'a0';
  }

  if (a === null) {
    if (b === null) return 'a0';
    const bFirst = getIndex(b.at(0));
    if (bFirst > 0) {
      const mid = Math.floor((0 + bFirst) / 2);
      const char = DIGITS[mid];
      return char ?? '0';
    }
    return '0';
  }

  if (b === null) {
    const aFirst = getIndex(a.at(0));
    if (aFirst < DIGITS.length - 1) {
      const nextChar = DIGITS[aFirst + 1];
      if (!nextChar) {
        return a + (DIGITS.at(Math.floor(DIGITS.length / 2)) ?? '');
      }
      return nextChar;
    }
    return a + (DIGITS.at(Math.floor(DIGITS.length / 2)) ?? '');
  }

  return findKeyBetween(a, b, 0);
}
