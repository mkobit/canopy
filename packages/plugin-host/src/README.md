# Plugin host source

## Overview

This directory re-exports `./result-errors` and `./wasm` from `index.ts`, and defines `WitErrorCode` and `toWitError` in `result-errors.ts` to map `GraphAccessError` values into WIT error objects.

## Interface

- `[index.ts:*]` Re-exports all public symbols from `./result-errors` and `./wasm`.
- `[result-errors.ts:WitErrorCode]` Union type `'ValidationError' | 'NotFound' | 'ConcurrencyConflict' | 'PermissionDenied' | 'ResourceExhausted' | 'InternalError'`.
- `[result-errors.ts:toWitError]` Pure function mapping `GraphAccessError` to `Readonly<{ code: WitErrorCode; message: string }>`.
- Subdirectory: [wasm](./wasm/README.md) — Canopy WIT specification, capability/tier validation, closure-bound host bindings, and sandboxed/terminable WASM executors.

## Invariants

- `[result-errors.ts:toWitError]` Exhaustively maps every `GraphAccessErrorCategory` via `Readonly<Record<GraphAccessErrorCategory, WitErrorCode>>`, mapping both `UNAUTHORIZED` and `FORBIDDEN` to `'PermissionDenied'` and returning a `Readonly` object.

## Side Effects

- None.

## Verification

- Run: `bun test`
