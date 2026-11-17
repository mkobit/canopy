# API adapter source

## Overview

This directory exposes the `@canopy/api-adapter` barrel entry point (`index.ts`), rolling up the IPC transport adapter.

## Interface

- `[index.ts:*]` Re-exports `./ipc`.
- Subdirectories:
  - [ipc](./ipc/README.md) — JSON-RPC 2.0 IPC schemas, OpenRPC 1.3.2 spec, Unix socket server, and Effect client.

## Invariants

- None.

## Side Effects

- None.

## Verification

- Run: `bun test`
