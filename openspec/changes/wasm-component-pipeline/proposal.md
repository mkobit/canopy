## Why

Currently, guest plugins are authored in raw JavaScript and compiled as a single hardcoded mock file without optimization.
We need a robust build pipeline to compile TypeScript-based guest plugins, support dynamic multi-plugin configuration, and package compiled WASM components with Brotli compression.

## What Changes

- **Guest TypeScript bundling**: add support for compiling and bundling guest plugins written in TypeScript using Bun's native bundler.
- **Brotli compression and node packaging**: implement a packaging tool to Brotli-compress guest WASM binaries and generate graph-loadable plugin nodes.
- **Dynamic multi-plugin compilation**: update the `wit-codegen.ts` script to compile all plugins defined in a configuration file rather than a single hardcoded path.

## Capabilities

### New Capabilities

- `wasm-plugin-pipeline`: compile guest TypeScript plugins to ES modules, componentize them to WebAssembly, transpile them to JS, and compress/package them for graph database insertion.

### Modified Capabilities

- `modular-wit`: update codegen configurations to support dynamic multi-plugin target compilation.

## Impact

- `apps/web`: introduces `wit-codegen.ts` updates, new script for Brotli packaging, and typescript configuration adjustments for guest plugins.
