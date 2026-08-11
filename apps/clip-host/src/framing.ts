import type { Result } from '@canopy/graph';
import { err, ok } from '@canopy/graph';

// Chrome/Chromium's documented native-messaging cap on a single message
// (host<->extension, either direction) is ~1 MB. Rejecting at this boundary
// on the inbound (extension->host) side keeps one oversize/malformed frame
// from being buffered indefinitely or corrupting the framing of subsequent
// messages -- see design.md's "Large clip payloads" risk.
export const MAX_FRAME_BYTES = 1_048_576;

export type NativeMessagingFramingError = Readonly<{
  _tag: 'NativeMessagingFramingError';
  reason: 'oversize-frame' | 'malformed-json';
  message: string;
}>;

const framingError = (
  reason: NativeMessagingFramingError['reason'],
  message: string,
): NativeMessagingFramingError => ({ _tag: 'NativeMessagingFramingError', reason, message });

/** Encodes one native-messaging frame: a 4-byte little-endian length prefix followed by UTF-8 JSON. */
export const encodeFrame = (payload: unknown): Result<Buffer, NativeMessagingFramingError> => {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  if (json.byteLength > MAX_FRAME_BYTES) {
    return err(
      framingError(
        'oversize-frame',
        `Encoded frame is ${json.byteLength} bytes, exceeding the ${MAX_FRAME_BYTES}-byte native-messaging cap`,
      ),
    );
  }
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32LE(json.byteLength, 0);
  return ok(Buffer.concat([lengthPrefix, json]));
};

export type DecodedFrames = Readonly<{
  messages: readonly unknown[];
  /** Bytes not yet consumed -- either an incomplete length prefix or an incomplete message body. */
  remainder: Buffer;
}>;

/**
 * Extracts as many complete, length-prefixed JSON frames as `buffer` contains.
 * Pure: does not mutate `buffer` and performs no I/O. On a malformed or
 * oversize frame, returns an error and no messages -- callers must not act on
 * any prior message that would have shipped alongside it (no partial state).
 */
export const decodeFrames = (
  buffer: Buffer,
): Result<DecodedFrames, NativeMessagingFramingError> => {
  // eslint-disable-next-line functional/no-let -- local cursor into an immutable input buffer, not shared state
  let offset = 0;
  // eslint-disable-next-line functional/prefer-immutable-types -- local accumulator
  const messages: unknown[] = [];

  // eslint-disable-next-line functional/no-loop-statements
  while (buffer.byteLength - offset >= 4) {
    const declaredLength = buffer.readUInt32LE(offset);
    if (declaredLength > MAX_FRAME_BYTES) {
      return err(
        framingError(
          'oversize-frame',
          `Declared frame length ${declaredLength} exceeds the ${MAX_FRAME_BYTES}-byte native-messaging cap`,
        ),
      );
    }

    const bodyStart = offset + 4;
    const bodyEnd = bodyStart + declaredLength;
    if (buffer.byteLength < bodyEnd) {
      // Full frame not yet received; wait for more data.
      break;
    }

    const body = buffer.subarray(bodyStart, bodyEnd);
    // eslint-disable-next-line functional/no-try-statements
    try {
      // eslint-disable-next-line functional/immutable-data
      messages.push(JSON.parse(body.toString('utf8')) as unknown);
    } catch {
      return err(framingError('malformed-json', 'Frame body is not valid JSON'));
    }

    offset = bodyEnd;
  }

  return ok({ messages, remainder: buffer.subarray(offset) });
};
