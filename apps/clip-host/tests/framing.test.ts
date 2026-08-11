import { describe, expect, it } from 'bun:test';
import { MAX_FRAME_BYTES, decodeFrames, encodeFrame } from '../src/framing';

describe('native-messaging frame encode/decode', () => {
  it('7.1 round-trips a single message through encode then decode', () => {
    const encoded = encodeFrame({ jsonrpc: '2.0', method: 'canopy.v1.handshake', id: 1 });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const decoded = decodeFrames(encoded.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.messages).toEqual([
      { jsonrpc: '2.0', method: 'canopy.v1.handshake', id: 1 },
    ]);
    expect(decoded.value.remainder.byteLength).toBe(0);
  });

  it('7.1 decodes multiple concatenated frames in one call', () => {
    const first = encodeFrame({ id: 1 });
    const second = encodeFrame({ id: 2 });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const decoded = decodeFrames(Buffer.concat([first.value, second.value]));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.messages).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('7.1 leaves an incomplete frame in the remainder rather than erroring', () => {
    const encoded = encodeFrame({ id: 1, data: 'x'.repeat(100) });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const partial = encoded.value.subarray(0, encoded.value.byteLength - 10);
    const decoded = decodeFrames(partial);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.messages).toEqual([]);
    expect(decoded.value.remainder.equals(partial)).toBe(true);
  });

  it('7.1 rejects a malformed frame body without returning partial state', () => {
    const lengthPrefix = Buffer.alloc(4);
    const body = Buffer.from('{not valid json', 'utf8');
    lengthPrefix.writeUInt32LE(body.byteLength, 0);

    const decoded = decodeFrames(Buffer.concat([lengthPrefix, body]));
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error.reason).toBe('malformed-json');
  });

  it('7.1 rejects a frame whose declared length exceeds the native-messaging cap', () => {
    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeUInt32LE(MAX_FRAME_BYTES + 1, 0);

    const decoded = decodeFrames(lengthPrefix);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error.reason).toBe('oversize-frame');
  });

  it('7.1 rejects a malformed frame even when a valid frame preceded it in the same buffer', () => {
    const good = encodeFrame({ id: 1 });
    expect(good.ok).toBe(true);
    if (!good.ok) return;

    const lengthPrefix = Buffer.alloc(4);
    const badBody = Buffer.from('not json', 'utf8');
    lengthPrefix.writeUInt32LE(badBody.byteLength, 0);

    const decoded = decodeFrames(Buffer.concat([good.value, lengthPrefix, badBody]));
    expect(decoded.ok).toBe(false);
  });

  it('encodeFrame refuses to encode a payload larger than the native-messaging cap', () => {
    const encoded = encodeFrame({ content: 'x'.repeat(MAX_FRAME_BYTES + 1) });
    expect(encoded.ok).toBe(false);
    if (encoded.ok) return;
    expect(encoded.error.reason).toBe('oversize-frame');
  });
});
