## Context

Canopy requires a sandboxed plugin system where guest plugins can contribute custom wizard UIs and event generation capabilities.
Currently, the build pipeline compiles a single hardcoded JavaScript guest file into a WASM component and transpiles it.
To support real plugin development, we need a unified build pipeline that compiles TypeScript, compresses WASM binaries to minimize database bloat, and packages plugins into graph-ready formats.

## Goals / Non-Goals

**Goals:**

- compile and bundle TypeScript guest plugins into single-file ES modules.
- componentize and transpile guest modules according to role-specific WIT worlds.
- compress compiled WASM components using Brotli and package them into graph-loadable JSON nodes.
- automate the entire process using a centralized configuration file in `apps/web`.

**Non-Goals:**

- implementing client-side runtime loading of WASM binaries (this is handled by the plugin host loader in `plugin-context.tsx`).
- creating a registry server or out-of-band plugin delivery network.

## Decisions

### Decision 1: Bundling TypeScript guest plugins using Bun's native bundler
we will use `Bun.build` to compile TypeScript guest entry points and bundle their local dependencies into a single-file ES module before running `jco componentize`.
* **rationale**: `Bun.build` is extremely fast, has native TypeScript transpilation, and avoids adding third-party bundling tools like `esbuild` or `webpack`.
* **alternatives considered**: `tsc` (does not bundle dependencies, leaving import references), `esbuild` (requires installing extra npm packages).

### Decision 2: Brotli compression for compiled WASM binaries
we will compress compiled WASM components using Brotli before converting them to Base64 for database storage.
* **rationale**: raw transpiled WASM components can be over 12 MB, which causes severe graph database bloat and sync delays. Brotli compression reduces this overhead significantly.
* **alternatives considered**: raw storage (leads to slow sync times), Gzip compression (lower compression ratio than Brotli for WASM code).

### Decision 3: Centralized configuration file in `apps/web`
we will introduce `plugins.config.json` to define all guest plugins, their source entry points, WIT worlds, and output paths.
* **rationale**: avoids hardcoding compile commands for new plugins inside `wit-codegen.ts`.
* **alternatives considered**: separate build scripts per plugin (leads to duplicate script maintenance).

### Decision 4: Packaging output as graph-ready JSON nodes
the build pipeline will output packaged plugins as JSON files matching the Graph Node schema, making them directly importable by the Canopy database.
* **rationale**: allows easy plugin bootstrapping and test fixture loading without needing custom database insertion scripts.
* **alternatives considered**: raw event logs (more complex to generate and load than static node representations).

## Risks / Trade-offs

- [Risk] Brotli decompression overhead on the host client.
  - [Mitigation] The host client decompresses the WASM binary once and caches the compiled WebAssembly module in IndexedDB.
- [Risk] External package dependencies inside guest plugins.
  - [Mitigation] `Bun.build` bundles all standard dependencies into the guest, but we must configure host-provided capabilities (like `@canopy/graph`) as externals so they are correctly wired by `jco` at runtime.
