import { describe, expect, it } from 'bun:test';
import {
  queryPopupElement,
  resolvePopupElements,
  type PopupElementTag,
  type QueryRoot,
} from '../src/popup/dom';

const fakeElement = (tagName: PopupElementTag): Element =>
  ({ tagName: tagName.toUpperCase() }) as unknown as Element;

const createQueryRoot = (entries: Readonly<Record<string, PopupElementTag>>): QueryRoot => ({
  querySelector: (selector: string): Element | null => {
    const tag = entries[selector];
    return tag ? fakeElement(tag) : null;
  },
});

const COMPLETE_POPUP_DOM: Readonly<Record<string, PopupElementTag>> = {
  '#status': 'p',
  '#error': 'div',
  '#preview': 'div',
  '#preview-title': 'h2',
  '#preview-source': 'p',
  '#preview-content': 'div',
  '#confirm-button': 'button',
  '#discard-button': 'button',
};

describe('queryPopupElement', () => {
  it('returns the narrowed element when selector and tag match', () => {
    const root = createQueryRoot({ '#status': 'p' });
    const result = queryPopupElement('#status', 'p', root);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.tagName).toBe('P');
  });

  it('returns missing-element when querySelector returns null', () => {
    const root = createQueryRoot({});
    const result = queryPopupElement('#status', 'p', root);

    expect(result).toEqual({
      ok: false,
      error: {
        _tag: 'PopupDomError',
        reason: 'missing-element',
        selector: '#status',
        expectedTag: 'p',
        message: 'Missing required popup element "#status" (<p>).',
      },
    });
  });

  it('returns unexpected-tag when matched element has a different tag', () => {
    const root = createQueryRoot({ '#confirm-button': 'div' });
    const result = queryPopupElement('#confirm-button', 'button', root);

    expect(result).toEqual({
      ok: false,
      error: {
        _tag: 'PopupDomError',
        reason: 'unexpected-tag',
        selector: '#confirm-button',
        expectedTag: 'button',
        actualTag: 'div',
        message: 'Expected popup element "#confirm-button" to be <button>, found <div>.',
      },
    });
  });
});

describe('resolvePopupElements', () => {
  it('resolves all 8 popup elements when present with expected tags', () => {
    const root = createQueryRoot(COMPLETE_POPUP_DOM);
    const result = resolvePopupElements(root);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statusElement.tagName).toBe('P');
    expect(result.value.errorElement.tagName).toBe('DIV');
    expect(result.value.previewElement.tagName).toBe('DIV');
    expect(result.value.previewTitleElement.tagName).toBe('H2');
    expect(result.value.previewSourceElement.tagName).toBe('P');
    expect(result.value.previewContentElement.tagName).toBe('DIV');
    expect(result.value.confirmButton.tagName).toBe('BUTTON');
    expect(result.value.discardButton.tagName).toBe('BUTTON');
  });

  it('fails with missing-element when any required popup element is absent', () => {
    const incomplete = Object.fromEntries(
      Object.entries(COMPLETE_POPUP_DOM).filter(([selector]) => selector !== '#discard-button'),
    );
    const root = createQueryRoot(incomplete);
    const result = resolvePopupElements(root);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.reason).toBe('missing-element');
    expect(!result.ok && result.error.selector).toBe('#discard-button');
  });

  it('fails with unexpected-tag when a popup element has the wrong tag', () => {
    const root = createQueryRoot({ ...COMPLETE_POPUP_DOM, '#preview-title': 'div' });
    const result = resolvePopupElements(root);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.reason).toBe('unexpected-tag');
    expect(!result.ok && result.error.selector).toBe('#preview-title');
    expect(!result.ok && result.error.actualTag).toBe('div');
  });
});
