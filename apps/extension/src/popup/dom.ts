export type PopupElementTag = keyof HTMLElementTagNameMap;

export type QueryRoot = Readonly<Pick<ParentNode, 'querySelector'>>;

export type PopupDomError = Readonly<{
  _tag: 'PopupDomError';
  reason: 'missing-element' | 'unexpected-tag';
  selector: string;
  expectedTag: PopupElementTag;
  actualTag?: string;
  message: string;
}>;

export type PopupDomResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: PopupDomError }>;

export type PopupElements = Readonly<{
  statusElement: HTMLParagraphElement;
  errorElement: HTMLDivElement;
  previewElement: HTMLDivElement;
  previewTitleElement: HTMLHeadingElement;
  previewSourceElement: HTMLParagraphElement;
  previewContentElement: HTMLDivElement;
  confirmButton: HTMLButtonElement;
  discardButton: HTMLButtonElement;
}>;

const isElementOfTag = <K extends PopupElementTag>(
  element: Readonly<Element>,
  expectedTag: K,
): element is HTMLElementTagNameMap[K] => element.tagName.toLowerCase() === expectedTag;

/**
Queries `root` for `selector` and narrows the matched element to the expected
HTML tag type via runtime `tagName` verification instead of an unchecked
`querySelector<T>` generic assertion.
*/
export const queryPopupElement = <K extends PopupElementTag>(
  selector: string,
  expectedTag: K,
  root: QueryRoot = document,
): PopupDomResult<HTMLElementTagNameMap[K]> => {
  const element = root.querySelector(selector);
  if (element === null) {
    return {
      ok: false,
      error: {
        _tag: 'PopupDomError',
        reason: 'missing-element',
        selector,
        expectedTag,
        message: `Missing required popup element "${selector}" (<${expectedTag}>).`,
      },
    };
  }

  if (!isElementOfTag(element, expectedTag)) {
    const actualTag = element.tagName.toLowerCase();
    return {
      ok: false,
      error: {
        _tag: 'PopupDomError',
        reason: 'unexpected-tag',
        selector,
        expectedTag,
        actualTag,
        message: `Expected popup element "${selector}" to be <${expectedTag}>, found <${actualTag}>.`,
      },
    };
  }

  return { ok: true, value: element };
};

/**
Resolves all 8 required popup.html elements into a non-nullable, typed record.
*/
export const resolvePopupElements = (root: QueryRoot = document): PopupDomResult<PopupElements> => {
  const statusElement = queryPopupElement('#status', 'p', root);
  if (!statusElement.ok) return statusElement;

  const errorElement = queryPopupElement('#error', 'div', root);
  if (!errorElement.ok) return errorElement;

  const previewElement = queryPopupElement('#preview', 'div', root);
  if (!previewElement.ok) return previewElement;

  const previewTitleElement = queryPopupElement('#preview-title', 'h2', root);
  if (!previewTitleElement.ok) return previewTitleElement;

  const previewSourceElement = queryPopupElement('#preview-source', 'p', root);
  if (!previewSourceElement.ok) return previewSourceElement;

  const previewContentElement = queryPopupElement('#preview-content', 'div', root);
  if (!previewContentElement.ok) return previewContentElement;

  const confirmButton = queryPopupElement('#confirm-button', 'button', root);
  if (!confirmButton.ok) return confirmButton;

  const discardButton = queryPopupElement('#discard-button', 'button', root);
  if (!discardButton.ok) return discardButton;

  return {
    ok: true,
    value: {
      statusElement: statusElement.value,
      errorElement: errorElement.value,
      previewElement: previewElement.value,
      previewTitleElement: previewTitleElement.value,
      previewSourceElement: previewSourceElement.value,
      previewContentElement: previewContentElement.value,
      confirmButton: confirmButton.value,
      discardButton: discardButton.value,
    },
  };
};
