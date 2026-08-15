/* eslint-disable unicorn/no-top-level-assignment-in-function -- lazy singleton purifier cache */
import createDOMPurify from 'dompurify';

type Purifier = ReturnType<typeof createDOMPurify>;

// Tier-1 CSS policy: strip declarations that enable overlay/clickjacking
// (positioning) or load external resources (`url()`), which selector- and
// resource-based attacks rely on. The closed shadow root already contains
// plugin CSS to the block; this narrows what survives inside it.
const BLOCKED_STYLE_PROPERTIES: ReadonlySet<string> = new Set(['position', 'z-index']);

// Exported for direct unit testing; happy-dom mishandles DOMPurify's style
// processing, so the CSS policy is verified here and end-to-end in the browser.
export const sanitizeStyleValue = (style: string): string =>
  style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.length > 0)
    .filter((declaration) => {
      const property = declaration.split(':', 1)[0]?.trim().toLowerCase() ?? '';
      if (BLOCKED_STYLE_PROPERTIES.has(property)) {
        return false;
      }
      // Reject any external resource reference regardless of property.
      return !/url\s*\(/i.test(declaration);
    })
    .join('; ');

// Lazily bind DOMPurify to the global `window` on first use (the default export
// is a factory until a window is available) and install the style-narrowing
// hook once. DOMPurify hooks mutate nodes in place, inherent to DOM sanitization.
// eslint-disable-next-line functional/no-let, functional/prefer-immutable-types -- memoized singleton purifier (DOMPurify instance is mutable by contract)
let purifier: Purifier | undefined;

// eslint-disable-next-line functional/prefer-immutable-types -- returns the mutable DOMPurify instance by contract
const getPurifier = (): Purifier => {
  if (purifier !== undefined) {
    return purifier;
  }
  const created = createDOMPurify(globalThis);
  // eslint-disable-next-line functional/prefer-immutable-types -- DOMPurify hook receives a mutable DOM node by contract
  created.addHook('afterSanitizeAttributes', (node: Element) => {
    if (!node.hasAttribute('style')) {
      return;
    }
    const cleaned = sanitizeStyleValue(node.getAttribute('style') ?? '');
    // eslint-disable-next-line unicorn/prefer-toggle-attribute -- setting/removing a valued attribute, not toggling presence
    if (cleaned.length > 0) {
      node.setAttribute('style', cleaned);
    } else {
      node.removeAttribute('style');
    }
  });
  purifier = created;
  return created;
};

// Sanitize untrusted plugin HTML for Tier-1 inline rendering. DOMPurify strips
// scripts and event-handler attributes (`SANITIZE_DOM`) and namespaces `id`/
// `name` to defeat DOM clobbering (`SANITIZE_NAMED_PROPS`); the style hook
// applies the CSS policy above. This is Tier-1's entire XSS defense — a bypass
// here is a full host XSS, which is why the renderer stays Tier-1-only.
export const sanitizeRenderedHtml = (rawHtml: string): string =>
  getPurifier().sanitize(rawHtml, {
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
  });
