import { MAX_CLIP_CONTENT_BYTES } from './constants.js';
import type { ClipPayload, RawClipCapture } from './messages.js';

export type ClipPayloadError = Readonly<{
  _tag: 'ClipPayloadError';
  reason: 'empty-content' | 'oversize-content';
  message: string;
}>;

export type ClipPayloadResult =
  Readonly<{ ok: true; value: ClipPayload }> | Readonly<{ ok: false; error: ClipPayloadError }>;

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

/**
 * Pure: picks the selection over extracted main content when a selection
 * exists (design.md's "Clip a selection" scenario), enforces the
 * native-messaging/UDS size cap, and rejects rather than silently truncating.
 */
export const buildClipPayload = (
  capture: RawClipCapture,
  capturedAt: string,
): ClipPayloadResult => {
  const content =
    capture.selectionText.trim().length > 0 ? capture.selectionText : capture.mainText;

  if (content.trim().length === 0) {
    return {
      ok: false,
      error: {
        _tag: 'ClipPayloadError',
        reason: 'empty-content',
        message: 'No content to clip: the page had no extractable content and no selection.',
      },
    };
  }

  if (byteLength(content) > MAX_CLIP_CONTENT_BYTES) {
    return {
      ok: false,
      error: {
        _tag: 'ClipPayloadError',
        reason: 'oversize-content',
        message: `Clip content is ${byteLength(content)} bytes, exceeding the ${MAX_CLIP_CONTENT_BYTES}-byte cap. Try selecting a smaller portion of the page.`,
      },
    };
  }

  return {
    ok: true,
    value: {
      title: capture.title,
      sourceUrl: capture.sourceUrl,
      content,
      capturedAt,
    },
  };
};
