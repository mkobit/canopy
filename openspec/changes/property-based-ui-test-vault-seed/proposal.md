## Why

Canopy requires realistic, reproducible graph vault datasets ("vaults") to validate user experience, query correctness, schema management, and UI rendering across both automated Playwright E2E testing and interactive manual development (`bun run dev:demo`).
Currently, unit and E2E tests manually construct minimal ad-hoc nodes, leaving gaps in end-to-end user workflow coverage and multi-format renderer resolution testing.

Establishing a modular, property-based graph seed generator in `apps/web/src/test/generators/` ensures both automated Playwright test suites and manual dev server walkthroughs boot against identical, domain-validated vault data.

## What changes

- Add property-based vault generator building blocks in `apps/web/src/test/generators/`:
  - `node-generators.ts`: Generates content nodes (`TextBlock`, `CodeBlock`, `MarkdownNode`, custom formats) with property-based text, metadata, and tags.
  - `schema-generators.ts`: Generates `Namespace`, `PropertyType`, `NodeType`, and `EdgeType` graph nodes adhering to `@canopy/graph` validation rules.
  - `query-generators.ts`: Generates `QueryDefinition` nodes containing query DSL filter steps and property selection arrays.
  - `graph-generators.ts`: Assembles connected graph vaults linking content nodes, schemas, queries, and directional edges.
- Provide seed configuration presets (`demo` for ~25-node personal knowledge graph; `large` for 500+ node stress graph).
- Add support for seedable deterministic RNG (`seed: 42`) for automated E2E assertion runs.
- Add `dev:demo` script in `apps/web/package.json` (`CANOPY_DEMO_SEED=true vite`) to automatically seed IndexedDB on boot when launching the dev server manually.
- Codify Architectural Invariant 10 in `AGENTS.md` and design docs: content nodes hold raw graph properties (`Node`, `Edge`, `Properties`); rendering format resolution (Markdown, rST, AsciiDoc, HTML, custom formats) is dynamically performed via `ViewDefinition` and `RendererDefinition` nodes pointing to WASM plugin components.

## Capabilities

### New capabilities

- `property-based-ui-test-vault-seed`: Modular property-based vault seed generator and unified E2E/manual test harness for `apps/web`.

### Modified capabilities

(none)

## Impact

- `apps/web`: Add generator modules in `src/test/generators/`, add E2E specs in `e2e/user-journeys.e2e.ts`, add `dev:demo` npm script.
- `AGENTS.md`: Update architectural invariants section with invariant 10 for decoupled WASM renderer resolution.
