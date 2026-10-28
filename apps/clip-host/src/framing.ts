import type { Result } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import { Array as EffectArray, Effect, Option } from 'effect';

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

/**
Encodes one native-messaging frame: a 4-byte little-endian length prefix followed by UTF-8 JSON.
*/
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
  /**
  Bytes not yet consumed -- either an incomplete length prefix or an incomplete message body.
  */
  remainder: Buffer;
}>;

type FrameRecord = Readonly<{
  result: Result<unknown, NativeMessagingFramingError>;
  end: number;
}>;

const readFrame = (
  buffer: Buffer,
  offset: number,
): Readonly<Option.Option<readonly [FrameRecord, number]>> => {
  if (buffer.byteLength - offset < 4) return Option.none<readonly [FrameRecord, number]>();
  const declaredLength = buffer.readUInt32LE(offset);
  if (declaredLength > MAX_FRAME_BYTES) {
    return Option.some([
      {
        result: err(
          framingError(
            'oversize-frame',
            `Declared frame length ${declaredLength} exceeds the ${MAX_FRAME_BYTES}-byte native-messaging cap`,
          ),
        ),
        end: offset,
      },
      buffer.byteLength,
    ]);
  }
  const bodyStart = offset + 4;
  const bodyEnd = bodyStart + declaredLength;
  if (buffer.byteLength < bodyEnd) return Option.none<readonly [FrameRecord, number]>();
  const parsed = Effect.runSync(
    Effect.result(
      Effect.try({
        try: (): unknown => JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString('utf8')),
        catch: () => framingError('malformed-json', 'Frame body is not valid JSON'),
      }),
    ),
  );
  const result = parsed._tag === 'Success' ? ok(parsed.success) : err(parsed.failure);
  return Option.some([{ result, end: bodyEnd }, result.ok ? bodyEnd : buffer.byteLength]);
};

/**
Extracts complete frames without mutating input. Inspect terminal errors before
exposing any messages so valid-then-invalid input remains atomic.
*/
export const decodeFrames = (
  buffer: Buffer,
): Result<DecodedFrames, NativeMessagingFramingError> => {
  const records: readonly FrameRecord[] = EffectArray.unfold(0, (offset) =>
    readFrame(buffer, offset),
  );
  const failure = records.find((record) => !record.result.ok)?.result;
  if (failure && !failure.ok) return err(failure.error);
  const messages = records.map((record) => (record.result.ok ? record.result.value : undefined));
  return ok({ messages, remainder: buffer.subarray(records.at(-1)?.end ?? 0) });
};
