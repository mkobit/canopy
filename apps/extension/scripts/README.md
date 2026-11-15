# Extension build scripts

## Overview

This directory contains the static asset copy script (`copy-static.ts`) that copies the browser extension manifest and popup HTML into the `dist/` output directory.

## Interface

- None (executable build script with no module exports).

## Invariants

- `[copy-static.ts:STATIC_FILES]` Copies only `['manifest.json', 'src/popup/popup.html']`.
- `[copy-static.ts:rootDirectory, copy-static.ts:distDirectory]` Resolves source paths from the parent of `import.meta.dirname` and targets its `dist/` subdirectory, stripping a leading `src/` prefix from non-manifest destination paths.

## Side Effects

- `[copy-static.ts:mkdirSync]` Creates destination parent directories recursively on the filesystem.
- `[copy-static.ts:cpSync]` Copies each file in `STATIC_FILES` from `rootDirectory` to `distDirectory` on the filesystem.

## Verification

- Run: `bun test`
