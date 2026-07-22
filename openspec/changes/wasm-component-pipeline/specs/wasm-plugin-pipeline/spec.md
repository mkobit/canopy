## ADDED Requirements

### Requirement: Guest plugin TypeScript bundling

The build pipeline SHALL compile and bundle TypeScript-based guest plugin source files into a single self-contained ES module JavaScript file.

#### Scenario: Successful guest bundling

- **WHEN** the guest plugin builder compiles a TypeScript entry point
- **THEN** it SHALL produce a single ES module JS file with no dependencies external to the guest, leaving host imports (like `@canopy/graph` or `canopy:graph/*`) as external references.

### Requirement: WebAssembly componentization and transpilation

The build pipeline SHALL convert the bundled JavaScript output into a WebAssembly Component using `jco componentize` and transpile it into browser-compatible JavaScript wrapper bindings.

#### Scenario: Componentizing and transpiling guest JS

- **WHEN** the pipeline runs `jco componentize` and `jco transpile`
- **THEN** it SHALL output browser-compatible wrapper JS files and matching TypeScript declarations (`.d.ts`) matching the target world definitions.

### Requirement: Brotli compression

The packaging pipeline SHALL compress compiled WebAssembly component binaries using Brotli to minimize sync payload size.

#### Scenario: Brotli compression of WASM components

- **WHEN** the packaging tool processes a compiled WASM component
- **THEN** it SHALL produce a Brotli-compressed binary output.

### Requirement: Graph node packaging

The packaging pipeline SHALL output a JSON document representing a valid `plugin` node in the graph, containing the manifest JSON and the base64-encoded Brotli-compressed WebAssembly component.

#### Scenario: Packaging plugin node JSON

- **WHEN** the packaging tool is run with the manifest JSON and Brotli-compressed WASM component
- **THEN** it SHALL output a JSON payload representing a Graph Node of type `plugin` with `manifest` and `wasm_binary` properties ready for insertion.

### Requirement: Raw and Brotli-compressed WebAssembly binary validation

The graph validation pipeline SHALL support validating both raw and Brotli-compressed base64-encoded WebAssembly binaries.

#### Scenario: Validation of raw WebAssembly binary

- **WHEN** a plugin node contains a base64-encoded raw WebAssembly binary
- **THEN** the validator SHALL pass validation if it starts with the standard WebAssembly magic header.

#### Scenario: Validation of Brotli-compressed WebAssembly binary

- **WHEN** a plugin node contains a base64-encoded Brotli-compressed WebAssembly binary
- **THEN** the validator SHALL decompress it and pass validation if the decompressed bytes start with the standard WebAssembly magic header.
