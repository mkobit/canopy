import type { RawClipCapture } from '../shared/messages.js';

// Injected programmatically (chrome.scripting.executeScript with `files`,
// not a manifest-declared content script -- see AGENTS.md) on each capture
// click, so this must tolerate being injected more than once per page
// without redeclaration errors. Wrapping in an IIFE keeps all bindings
// function-scoped instead of polluting the page's top-level scope.
//
// Reads only inert text (document.title, the current selection, innerText)
// and never evaluates or forwards any page-provided code -- see the
// "Content-script injection / hostile page content" mitigation in
// openspec/changes/browser-extension-web-clipper/design.md.
(() => {
  const title = document.title;
  const sourceUrl = location.href;
  const selectionText = (getSelection()?.toString() ?? '').trim();
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- innerText approximates rendered/visible text (CSS-aware); textContent would also pull in hidden nav/script/style text
  const mainText = (document.body?.innerText ?? '').trim();

  const capture: RawClipCapture = { title, sourceUrl, selectionText, mainText };
  return capture;
})();
