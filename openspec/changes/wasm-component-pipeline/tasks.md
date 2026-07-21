## 1. Guest TypeScript compilation and bundling build pipeline (canopy-5hw.1)

- [x] 1.1 Create the typescript compilation script in `apps/web/scripts/` to bundle guest TS to ESM JS using `Bun.build`.
- [x] 1.2 Update the compilation flow to treat host packages (e.g., `@canopy/graph`) as external imports.
- [x] 1.3 Port the guest mock plugin (`guest.js`) to a TypeScript file (`guest.ts`) and verify it bundles cleanly.


## 2. Brotli compression and graph node packaging tool (canopy-5hw.2)

- [ ] 2.1 Write the packaging script `apps/web/scripts/package-plugin.ts` using node's `zlib` Brotli compression.
- [ ] 2.2 Construct the JSON structure representing a Graph Node for the plugin, containing manifest properties and Base64-encoded Brotli-compressed binary.
- [ ] 2.3 Add a validation run to verify the packaged JSON node is correctly generated.

## 3. Configuration-driven multiple plugin discovery and compilation (canopy-5hw.3)

- [ ] 3.1 Define `plugins.config.json` in `apps/web` to configure plugin entry points, target worlds, and output paths.
- [ ] 3.2 Refactor `apps/web/scripts/wit-codegen.ts` to dynamically read `plugins.config.json` and compile all defined plugins.
- [ ] 3.3 Verify the entire build and codegen pipeline runs successfully via `bun run build` and type checking.
