import { expect, it } from 'bun:test';
import { MAX_FRAME_BYTES, decodeFrames, encodeFrame } from '../src/framing';

const frame = (payload: unknown): Buffer => {
  const result = encodeFrame(payload);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

it('Fragmented prefix and body preserve exact bytes and input immutability', () => {
  const original = frame({ text: 'héllo', id: 3 });
  const snapshot = Buffer.from(original);
  for (let split = 1; split < original.length; split++) {
    const partial = original.subarray(0, split);
    const first = decodeFrames(partial);
    expect(first.ok).toBe(true);
    if (!first.ok) continue;
    expect(first.value.messages).toEqual([]);
    expect(first.value.remainder).toEqual(partial);
    const completed = decodeFrames(
      Buffer.concat([first.value.remainder, original.subarray(split)]),
    );
    expect(completed).toEqual({
      ok: true,
      value: { messages: [{ text: 'héllo', id: 3 }], remainder: Buffer.alloc(0) },
    });
  }
  expect(original).toEqual(snapshot);
});

it('Combined messages retain order and an incomplete tail', () => {
  const tail = frame({ id: 3 }).subarray(0, 6);
  expect(decodeFrames(Buffer.concat([frame({ id: 1 }), frame({ id: 2 }), tail]))).toEqual({
    ok: true,
    value: { messages: [{ id: 1 }, { id: 2 }], remainder: tail },
  });
});

it('Malformed or oversize rejection is atomic and the cap is inclusive', () => {
  const oversize = Buffer.alloc(4);
  oversize.writeUInt32LE(MAX_FRAME_BYTES + 1);
  const malformed = Buffer.from([1, 0, 0, 0, 123]);
  for (const [bad, reason] of [
    [oversize, 'oversize-frame'],
    [malformed, 'malformed-json'],
  ] as const) {
    const result = decodeFrames(Buffer.concat([frame(0), bad]));
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('value');
    if (!result.ok) expect(result.error.reason).toBe(reason);
  }
  const atCap = 'x'.repeat(MAX_FRAME_BYTES - 2);
  const encoded = encodeFrame(atCap);
  expect(encoded.ok).toBe(true);
  if (encoded.ok) expect(decodeFrames(encoded.value).ok).toBe(true);
  expect(encodeFrame(atCap + 'x').ok).toBe(false);
});

it('Many small frames are ordered and stack safe; record time and allocation growth', () => {
  for (const count of [1000, 10_000, 50_000]) {
    const input = Buffer.concat(Array.from({ length: count }, (_, index) => frame(index)));
    const before = process.memoryUsage();
    const start = performance.now();
    const result = decodeFrames(input);
    const elapsedMs = performance.now() - start;
    const after = process.memoryUsage();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.messages).toEqual(Array.from({ length: count }, (_, index) => index));
      expect(result.value.remainder.length).toBe(0);
    }
    console.error(
      JSON.stringify({
        count,
        bytes: input.length,
        elapsedMs,
        heapDelta: after.heapUsed - before.heapUsed,
        rssDelta: after.rss - before.rss,
      }),
    );
  }
});
