# Extension popup

## Overview

This directory provides runtime-validated DOM element resolution (`dom.ts`) and the top-level popup lifecycle script (`popup.ts`) that captures the active tab, stages clips via background messaging, and handles user confirm or discard actions.

## Interface

- `[dom.ts:PopupElementTag]` Type alias for `keyof HTMLElementTagNameMap`.
- `[dom.ts:QueryRoot]` `readonly Pick<ParentNode, 'querySelector'>`.
- `[dom.ts:PopupDomError]` Discriminated error object (`_tag: 'PopupDomError'`, `reason: 'missing-element' | 'unexpected-tag'`).
- `[dom.ts:PopupDomResult]` Discriminated union result type for DOM queries.
- `[dom.ts:PopupElements]` `readonly` record of the 8 typed popup HTML elements.
- `[dom.ts:queryPopupElement]` Exported function querying a selector and validating its `tagName`.
- `[dom.ts:resolvePopupElements]` Exported function resolving all 8 required popup elements into `PopupElements`.

## Invariants

- `[dom.ts:queryPopupElement]` Verifies `element !== null` and `element.tagName.toLowerCase() === expectedTag` via `isElementOfTag` before returning `ok: true`.
- `[dom.ts:resolvePopupElements]` Requires all 8 elements (`#status p`, `#error div`, `#preview div`, `#preview-title h2`, `#preview-source p`, `#preview-content div`, `#confirm-button button`, `#discard-button button`) to exist with matching tags, short-circuiting on the first error.
- `[popup.ts:captureActiveTab]` Throws `Error('No active tab to capture.')` if no active tab with an `id` is returned.
- `[popup.ts:showPreview]` Attaches click handlers with `{ once: true }` to `confirmButton` and `discardButton`.
- `[popup.ts:disableActions]` Sets `confirmButton.disabled = true` and `discardButton.disabled = true` at the start of `handleConfirm` and `handleDiscard` before sending background requests.
- `[popup.ts:run]` Exits early if `!popupElements.ok` and catches errors in a top-level `try`/`catch` to render UI errors rather than throwing.

## Side Effects

- `[popup.ts:popupElements]` Queries `document` at module load via `resolvePopupElements(document)` and executes `void run()` at module load.
- `[popup.ts:captureActiveTab]` Calls `chrome.tabs.query` and injects `content/content-script.js` via `chrome.scripting.executeScript`.
- `[popup.ts:sendToBackground]` Sends `'stage-clip'`, `'confirm-commit'`, and `'discard'` messages via `chrome.runtime.sendMessage`.
- `[popup.ts:setStatus]`, `[popup.ts:setError]`, `[popup.ts:showPreview]`, `[popup.ts:handleDiscard]` Mutate `textContent`, `style.display`, and button click listeners on the resolved popup DOM elements.

## Verification

- Run: `bun test`
