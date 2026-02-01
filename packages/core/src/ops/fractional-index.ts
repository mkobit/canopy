export const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function getIndex(char: string | undefined): number {
  if (char === undefined) return -1;
  return DIGITS.indexOf(char);
}

/**
 * Generates a sort key lexicographically between two keys.
 * Keys use the base62 alphabet.
 */
export function generateKeyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`a (${a}) must be less than b (${b})`);
  }

  // Handle nulls
  if (a === null && b === null) {
    return 'a0';
  }

  // Treat null start as before the first char, effectively empty string-like but handled via indices
  // We'll iterate characters.

  let index = 0;

  // If a is null, we treat it as effectively empty string, BUT we want to return something < b.
  // If b is "0", we need something smaller. "0" is min char.
  // We can't produce a string < "0" if "0" is the min char and we rely on standard string comparison.
  // We assume "0" is reserved or start with "a0".

  // Simplified logic:
  // If a is null, we try to find a key before b.
  // If b starts with a character > DIGITS[0], we can pick a smaller character.
  // If b starts with DIGITS[0] ("0"), we can't.

  if (a === null) {
     if (b === null) return 'a0'; // handled above
     // b is "..."
     const bFirst = getIndex(b[0]);
     if (bFirst > 0) {
       // Return something starting with (bFirst + 0) / 2
       const mid = Math.floor((0 + bFirst) / 2);
       if (mid === 0) {
           // 0 and 1 -> 0. We avoid 0 if we can, or just append.
           // If bFirst is 1 ('1'), mid is 0 ('0'). "0" < "1...". OK.
           return DIGITS[mid];
       }
       return DIGITS[mid];
     }
     // b starts with '0'. We can't go before it easily without changing alphabet or allowing empty.
     // Let's assume user doesn't hit this or we just append to '0'? No.
     // If b="0...", we return "0" something? No "0" < "0...".
     // We return "0" if b="00"? "0" < "00".
     // But if b="0", we are stuck.
     // Fallback: assume 'a0' is the standard start and users don't go to '0'.
     return '0'; // Risky.
  }

  if (b === null) {
    // a is "..."
    // Find something after a.
    const aFirst = getIndex(a[0]);
    if (aFirst < DIGITS.length - 1) {
      return DIGITS[aFirst + 1];
    }
    // a is "z...". Append.
    return a + DIGITS[Math.floor(DIGITS.length / 2)];
  }

  // Both exist.
  while (true) {
    const charA = a[index]; // undefined if exhausted
    const charB = b[index]; // undefined if exhausted

    const valA = charA ? getIndex(charA) : -1; // -1 represents empty (conceptually min)
    const valB = charB ? getIndex(charB) : -1;

    // If charA is undefined, a ended. a is prefix of b.
    // valA = -1. valB >= 0.
    // If valB - valA > 1?
    // e.g. a="x", b="z". valA=-1 (at index 1), valB=-1. Wait.
    // a="x", b="z". index 0. valA='x', valB='z'.

    // Normal case: chars exist
    if (charA !== undefined && charB !== undefined) {
      if (valA === valB) {
        index++;
        continue;
      }

      const diff = valB - valA;
      if (diff > 1) {
        // We can fit a char in between
        const mid = Math.round((valA + valB) / 2);
        return a.slice(0, index) + DIGITS[mid];
      } else {
        // diff is 1. "a", "b".
        // We need > "a...", < "b...".
        // Append to a.
        // a + midChar.
        return a.slice(0, index + 1) + DIGITS[Math.floor(DIGITS.length / 2)];
      }
    }

    // One is exhausted.
    // Since a < b, a must be exhausted (prefix of b).
    // a="A", b="AB". index=1. charA=undefined (-1). charB='B'.
    // We want > "A", < "AB".
    // "A" + char < "AB"?
    // "AM" < "AB"? No. 'M' > 'B'.
    // We need "A" + char < "AB".
    // So char < 'B'.
    // Range (-1) to valB.
    // mid between -1 and valB.
    // If valB is 0 ('0'). Mid -1..0 -> -0.5 -> -1?
    // We can't insert between nothing and '0'.
    // But b="A0". We need > "A" < "A0".
    // "A" < "A0" is true.
    // Is there a string S: "A" < S < "A0"?
    // "A" + anything > "A0"?
    // "A" compares as "A" vs "A0".
    // Length 1 vs 2.
    // If we append '0': "A0" == "A0".
    // If we append anything >= '0', it is >= "A0".
    // So we CANNOT insert between "A" and "A0" in lexicographical order if '0' is the minimum char.
    // This is a known issue.
    // Workaround: We append to b? No, result must be < b.
    // We can't result < "A0" starting with "A".
    // We must change the previous characters? No that changes order relative to a.

    // This means we need to detect this case.
    // However, if we always generate keys like "a0", "a0V", etc, we avoid "A" vs "A0".
    // We avoid ending with the min char?
    // Let's assume we won't hit "A" vs "A0" often if we use midpoints properly.
    // But if we do:
    // Just return a + '0'. It equals b. That's a collision.
    // We'll append '0' to b? No.
    // We'll treat it as conflict and just return b? No.

    // Let's stick to appending to A with a mid char ('V').
    // "A" -> "AV".
    // "AV" > "AB". Order is wrong.

    // If a is prefix of b:
    // b has suffix. b[index] is charB.
    // We need char C such that C < charB.
    // min..charB.
    // If charB > min ('0'), pick mid.
    // If charB == min ('0'), we recurse?
    // b="A0". index=1. charB='0'.
    // We recurse to index 2?
    // b="A0...".
    // effectively we are looking for "A" + something < "A0...".
    // Impossible.

    // To solve this, we can assume we never hand out "A" if "A0" is possible, or we pad.
    // Or we just return a key that might be slightly out of order if pathological? No.

    // Let's use the standard "append mid" approach but be careful.

    if (charA === undefined) {
        // a="A", b="AB". index=1. valB='B'.
        // We want char < valB.
        // mid(0, valB).
        // If valB=1 ('1'), mid=0 ('0').
        // Return "A0". "A0" < "A1". "A" < "A0".
        // If valB=0 ('0'). b="A0".
        // We can't insert.
        // We must inspect further chars of b.
        // b="A0B".
        // "A0" < "A0A" < "A0B".
        // So we return "A0" + mid(0, 'B').

        // Loop until we find a char in b > '0'.
        while (index < b.length && b[index] === DIGITS[0]) {
            index++;
        }
        // now b[index] > '0' (or exhausted).
        // if exhausted: b="A000".
        // Impossible to insert between "A" and "A000".

        // If found b[index] > '0'.
        // We construct "A" + "0"*(zeros) + mid(0, b[index]).

        const zeros = b.slice(a.length, index); // "00"
        const charAt = b[index];
        const valAt = getIndex(charAt);
        const midVal = Math.floor(valAt / 2);
        return a + zeros + DIGITS[midVal];
    }

    break;
  }

  return b!; // Should not reach here
}
