import { describe, it, expect } from 'vitest';
import { generateKeyBetween } from './fractional-index';

describe('fractional-index', () => {
  it('generates a start key', () => {
    expect(generateKeyBetween(null, null)).toBe('a0');
  });

  it('generates a key after start', () => {
    const start = 'a0';
    const next = generateKeyBetween(start, null);
    expect(next > start).toBe(true);
    // 'a' index 10. 'b' index 11.
    // 'a0' -> 'b' is valid.
    expect(next).toBe('b');
  });

  it('generates a key before start', () => {
    const start = 'a0';
    const prev = generateKeyBetween(null, start);
    expect(prev < start).toBe(true);
    // 'a' index 36. Mid 18 -> 'I'.
    expect(prev).toBe('I');
  });

  it('generates a key between two keys with gap', () => {
    const a = 'a0';
    const b = 'a2';
    const mid = generateKeyBetween(a, b);
    expect(mid > a).toBe(true);
    expect(mid < b).toBe(true);
    expect(mid).toBe('a1');
  });

  it('generates a key between adjacent keys (append)', () => {
    const a = 'a0';
    const b = 'a1';
    const mid = generateKeyBetween(a, b);
    expect(mid > a).toBe(true);
    expect(mid < b).toBe(true);
    // a + mid('V')
    expect(mid).toBe('a0V');
  });

  it('handles prefix case', () => {
    const a = 'a';
    const b = 'b';
    const mid = generateKeyBetween(a, b);
    expect(mid).toBe('aV');
    expect(mid > a).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('handles nested prefix case a < b (b is extension of a)', () => {
    // This is the hard case: a="A", b="A1".
    // We want > "A", < "A1".
    // "A0" works.
    const a = 'A';
    const b = 'A1';
    const mid = generateKeyBetween(a, b);
    expect(mid > a).toBe(true);
    expect(mid < b).toBe(true);
    expect(mid).toBe('A0');
  });

  it('handles nested prefix case a < b where b starts with 0', () => {
    // a="A", b="A01".
    // We want > "A", < "A01".
    // "A00" works.
    const a = 'A';
    const b = 'A01';
    const mid = generateKeyBetween(a, b);
    expect(mid > a).toBe(true);
    expect(mid < b).toBe(true);
    expect(mid).toBe('A00');
  });

  it('throws if order is wrong', () => {
    expect(() => generateKeyBetween('b', 'a')).toThrow();
  });
});
