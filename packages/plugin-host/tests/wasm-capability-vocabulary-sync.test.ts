import { describe, expect, it } from 'bun:test';
import { RECOGNIZED_WASM_CAPABILITIES } from '@canopy/graph';
import { KNOWN_WASM_CAPABILITIES } from '../src/wasm/capabilities';

const byString = (a: string, b: string): number => a.localeCompare(b);

// The capability vocabulary is intentionally duplicated: `@canopy/graph` is the
// leaf kernel and cannot import `@canopy/plugin-host`, so manifest validation
// keeps its own copy in `RECOGNIZED_WASM_CAPABILITIES`. This guard fails CI if
// the two lists drift apart. It is an interim safety net until `canopy-3xr`
// derives the vocabulary from a single source.
describe('WASM capability vocabulary cross-package sync', () => {
  const hostCapabilities = new Set<string>(KNOWN_WASM_CAPABILITIES);

  it('graph and plugin-host recognize exactly the same capability strings', () => {
    const graphSorted = [...RECOGNIZED_WASM_CAPABILITIES].toSorted(byString);
    const hostSorted = [...hostCapabilities].toSorted(byString);
    expect(graphSorted).toEqual(hostSorted);
  });

  it('every plugin-host capability is recognized by graph manifest validation', () => {
    for (const capability of KNOWN_WASM_CAPABILITIES) {
      expect(RECOGNIZED_WASM_CAPABILITIES.has(capability)).toBe(true);
    }
  });

  it('every graph-recognized capability is a known plugin-host capability', () => {
    for (const capability of RECOGNIZED_WASM_CAPABILITIES) {
      expect(hostCapabilities.has(capability)).toBe(true);
    }
  });
});
