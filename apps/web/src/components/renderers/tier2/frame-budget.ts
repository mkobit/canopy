/* eslint-disable functional/immutable-data -- encapsulated live-frame budget counter (mutation is the point) */

// Bounds the number of simultaneously-live Tier-2 iframes regardless of document
// length (design decision 6). Per-block frames reach >1.5 GB at 300 blocks, so a
// live frame is a scarce resource: only in-viewport blocks that acquire a slot
// mount one; the rest show a static preview. Recycling is expressed declaratively
// — an off-screen block unmounts its iframe (destroying the element, which clears
// `window.name`/history) and releases its slot; a scrolled-in block mounts a
// fresh element with a fresh nonce.

export const MAX_LIVE_TIER2_FRAMES = 12;

// Encapsulated counter held on an object so the module has no reassigned
// top-level binding (the reservation state is the deliberate mutation).
const budget = { live: 0 };

// Attempts to reserve a live-frame slot. Returns false when the budget is full,
// in which case the caller shows a static preview instead of a live frame.
export const acquireFrameSlot = (): boolean => {
  if (budget.live >= MAX_LIVE_TIER2_FRAMES) {
    return false;
  }
  budget.live += 1;
  return true;
};

export const releaseFrameSlot = (): void => {
  if (budget.live > 0) {
    budget.live -= 1;
  }
};
