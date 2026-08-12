import { describe, expect, it } from 'bun:test';
import { buildClipPayload } from '../src/shared/clip-payload';
import { MAX_CLIP_CONTENT_BYTES } from '../src/shared/constants';

const CAPTURED_AT = '2026-08-11T12:00:00.000Z';

describe('buildClipPayload', () => {
  it('uses the selection when present, over the extracted main content', () => {
    const result = buildClipPayload(
      {
        title: 'Example',
        sourceUrl: 'https://example.com',
        selectionText: 'the selected text',
        mainText: 'the whole page main content',
      },
      CAPTURED_AT,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.content).toBe('the selected text');
    expect(result.ok && result.value.capturedAt).toBe(CAPTURED_AT);
  });

  it('falls back to main content when there is no selection', () => {
    const result = buildClipPayload(
      {
        title: 'Example',
        sourceUrl: 'https://example.com',
        selectionText: '',
        mainText: 'the whole page main content',
      },
      CAPTURED_AT,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.content).toBe('the whole page main content');
  });

  it('rejects a clip with no extractable content and no selection', () => {
    const result = buildClipPayload(
      {
        title: 'Empty',
        sourceUrl: 'https://example.com',
        selectionText: '',
        mainText: ' '.repeat(3),
      },
      CAPTURED_AT,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.reason).toBe('empty-content');
  });

  it('rejects rather than truncates oversize content', () => {
    const oversize = 'x'.repeat(MAX_CLIP_CONTENT_BYTES + 1);
    const result = buildClipPayload(
      { title: 'Big', sourceUrl: 'https://example.com', selectionText: '', mainText: oversize },
      CAPTURED_AT,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.reason).toBe('oversize-content');
  });
});
