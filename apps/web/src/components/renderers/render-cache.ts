/* eslint-disable functional/immutable-data -- encapsulated LRU cache state (mutation is the point) */
import type { Node } from '@canopy/graph';

// Bounded LRU cache of rendered HTML keyed by (node id, content hash). A content
// hash rather than a global graph revision means editing one block does not
// invalidate every block's cache, and the bound keeps a long session from
// growing memory without limit.
const MAX_CACHE_ENTRIES = 256;

const cache = new Map<string, string>();

// FNV-1a over the node's serialized properties. Cheap, synchronous, and only
// used for cache keying (not security), so a non-cryptographic hash is fine.
export const hashContent = (node: Node): string => {
  const serialized = JSON.stringify([...node.properties]);
  // eslint-disable-next-line unicorn/no-array-reduce -- FNV-1a fold over characters
  const hash = [...serialized].reduce(
    (accumulator, character) =>
      Math.imul(accumulator ^ (character.codePointAt(0) ?? 0), 0x01_00_01_93),
    0x81_1c_9d_c5,
  );
  return (hash >>> 0).toString(16);
};

export const renderCacheKey = (nodeId: string, contentHash: string): string =>
  `${nodeId}:${contentHash}`;

export const getCachedRender = (key: string): string | undefined => {
  const value = cache.get(key);
  if (value !== undefined) {
    // Refresh recency: re-insert to move to the end of iteration order.
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
};

export const setCachedRender = (key: string, html: string): void => {
  cache.delete(key);
  cache.set(key, html);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
};
