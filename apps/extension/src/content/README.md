# Extension content script

## Overview

This directory contains the browser extension content script injected into the active tab. It runs as an anonymous IIFE to read page metadata and visible text (`title`, `sourceUrl`, `selectionText`, `mainText`) into a `RawClipCapture` object.

## Interface

- None (no module exports; anonymous IIFE returns `RawClipCapture` `[content-script.ts:capture]`).

## Invariants

- `[content-script.ts:L13-L22]` All bindings remain function-scoped inside an anonymous IIFE so repeated programmatic injection does not cause redeclaration errors or pollute top-level page scope.
- `[content-script.ts:title, sourceUrl, selectionText, mainText]` Reads only inert text and URL properties (`document.title`, `location.href`, `getSelection()?.toString()`, `document.body?.innerText`), defaulting nullish `selectionText` and `mainText` to `''` and trimming whitespace.

## Side Effects

- None.

## Verification

- Run: `bun test`
