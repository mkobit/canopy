# Web plugin & benchmark scripts

## Overview

This directory contains the WIT codegen and plugin-packaging CLI scripts (`wit-codegen.ts`, `package-plugin.ts`), their shared configuration types (`plugin-config.ts`), and manual WASM/worker render benchmarks (`bench-wasm-render.ts`, `bench-render-worker.ts`).

## Interface

- `[plugin-config.ts:PluginConfig]` Exported interface with `readonly` fields `name`, `entrypoint`, `world`, and `outDir`.
- `[plugin-config.ts:ConfigSchema]` Exported interface with `readonly` field `plugins: readonly PluginConfig[]`.
- `[bench-render-worker.ts:self.onmessage]` Worker message handler accepting `{ id: number; inputJson: string }` and posting `{ id: number; ok: boolean }`.
- `[bench-wasm-render.ts:main]`, `[package-plugin.ts:main]`, `[wit-codegen.ts:main]` Top-level executable CLI entrypoints invoked at module load.

## Invariants

- `[plugin-config.ts:PluginConfig]` and `[plugin-config.ts:ConfigSchema]` All properties and arrays are `readonly`.
- `[bench-render-worker.ts:self.onmessage]` Looks up `WORKER_GUESTS.get('fixture:interactive')` and executes `'render:interactive'`, posting `{ id, ok: false }` if guest or graph context is undefined.
- `[bench-wasm-render.ts:process.on]` Swallows only `uncaughtException` errors whose message includes `'tcp_wrap'`; instantiates `../src/plugin/markdown/transpiled/plugin.js` with `WASIShim({ sandbox: { enableNetwork: false } })`.
- `[package-plugin.ts:extractManifest]` Requires a `getManifest() { return ...; }` block in `plugin.entrypoint`; `[package-plugin.ts:main]` writes `GraphNode` (`system:node:plugin-<slug>`) with Brotli-compressed base64 `wasm_binary` and JSON-stringified `manifest`.
- `[wit-codegen.ts:main]` Runs `jco types`, `Bun.build` (target `'browser'`, format `'esm'`, external `canopy:graph/*`), `jco componentize`, and `jco transpile --instantiation` sequentially per plugin, throwing on non-zero exit codes.

## Side Effects

- `[bench-render-worker.ts:self.onmessage]` Creates a graph/context at module load, registers a worker `message` listener, and calls `self.postMessage`.
- `[bench-wasm-render.ts:main]` Registers a global `uncaughtException` listener, reads/compiles WASM files, spawns/terminates a Web Worker, and logs benchmark timings to stdout.
- `[package-plugin.ts:main]` Reads `plugins.config.json`, guest entrypoints, and `plugin.wasm` (evaluating `getManifest()` via `new Function`), writes `<outDir>/plugin-node.json`, and exits with code `1` on error.
- `[wit-codegen.ts:main]` Reads `plugins.config.json`, spawns external `bunx jco` subprocesses, writes bundled JS and generated WIT/WASM/transpiled files, and exits with code `1` on error.

## Verification

- Run: `bun test`
