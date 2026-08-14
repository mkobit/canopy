import { describe, expect, it } from 'bun:test';
import { RECOGNIZED_WASM_CAPABILITIES } from '@canopy/graph';
import { KNOWN_WASM_CAPABILITIES } from '../src/wasm/capabilities';

const byString = (a: string, b: string): number => a.localeCompare(b);

// The capability vocabulary is intentionally duplicated: `@canopy/graph` is the
// leaf kernel and cannot import `@canopy/api-adapter`, so manifest validation
// keeps its own copy in `RECOGNIZED_WASM_CAPABILITIES`. This guard fails CI if
// the two lists drift apart. It is an interim safety net until `canopy-3xr`
// derives the vocabulary from a single source.
describe('WASM capability vocabulary cross-package sync', () => {
  const adapterCapabilities = new Set<string>(KNOWN_WASM_CAPABILITIES);

  it('graph and api-adapter recognize exactly the same capability strings', () => {
    const graphSorted = [...RECOGNIZED_WASM_CAPABILITIES].toSorted(byString);
    const adapterSorted = [...adapterCapabilities].toSorted(byString);
    expect(graphSorted).toEqual(adapterSorted);
  });

  it('every api-adapter capability is recognized by graph manifest validation', () => {
    for (const capability of KNOWN_WASM_CAPABILITIES) {
      expect(RECOGNIZED_WASM_CAPABILITIES.has(capability)).toBe(true);
    }
  });

  it('every graph-recognized capability is a known api-adapter capability', () => {
    for (const capability of RECOGNIZED_WASM_CAPABILITIES) {
      expect(adapterCapabilities.has(capability)).toBe(true);
    }
  });
});
