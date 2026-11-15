# Web plugin system

## Overview

This directory adapts between WIT component-model property, node, and event representations and `@canopy/graph` domain types (`PropertyValue`, `Node`, `GraphEvent`) via `draft-session-shim.ts`, and groups guest type declarations, first-party/mock guest implementations, and the Web Worker runtime.

## Interface

- `[draft-session-shim.ts:mapWitValueToTs]`, `[draft-session-shim.ts:mapTsValueToWit]`, `[draft-session-shim.ts:mapTsNodeToWit]`, `[draft-session-shim.ts:mapWitEventToTs]` Pure/adapter conversion helpers between WIT and `@canopy/graph` types.
- `[draft-session-shim.ts:DraftSessionHandle]` Class wrapping a `DraftSession` (`applyEvents`, `getParentRevision`, `getNode`, `queryNodes`, `[Symbol.dispose]`).
- Subdirectories:
  - [guest-types](./guest-types/README.md) — Ambient `.d.ts` declarations for `canopy:graph/render-plugin` and `canopy:graph/plugin`.
  - [markdown](./markdown/README.md) — First-party Tier-1 Markdown renderer guest plugin.
  - [mock](./mock/README.md) — Two-step mock wizard guest plugin (`WizardSession`).
  - [runtime](./runtime/README.md) — Tier-1 Markdown WASM adapter and Tier-2 Web Worker runtime.

## Invariants

- `[draft-session-shim.ts:mapWitValueToTs]` Returns `null` for `null`, `undefined`, non-objects, objects lacking `'tag'`, `'none'` tag, or unknown tags; coerces `'integer'` with `Number(value.val)`.
- `[draft-session-shim.ts:mapTsValueToWit]` Maps integer numbers to `{ tag: 'integer', val: BigInt(value) }`, non-integer numbers to `{ tag: 'decimal', val: value }`, arrays to `'list-of-text'` filtered to strings, and `null`/`undefined`/unsupported values to `{ tag: 'none' }`.
- `[draft-session-shim.ts:mapWitEventToTs]` Supports only `'node-created'` and `'node-properties-updated'` tags, throwing `Error` on any other tag, and brands IDs and timestamps.
- `[draft-session-shim.ts:DraftSessionHandle]` Throws `new Error(result.error.type)` whenever the underlying `DraftSession` `Result` has `!result.ok`.

## Side Effects

- `[draft-session-shim.ts:mapWitEventToTs]` Reads `new Date().toISOString()` and generates a UUID via `crypto.randomUUID()` when `timestamp` or `eventId` are falsy.
- `[draft-session-shim.ts:DraftSessionHandle]` Delegates `applyEvents` to `this.draftSession.applyEvents` and calls `this.draftSession.discard()` in `[Symbol.dispose]`.

## Verification

- Run: `bun test`
