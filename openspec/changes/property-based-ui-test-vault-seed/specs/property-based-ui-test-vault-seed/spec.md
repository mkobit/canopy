# Property-Based UI Test Vault Seed Spec

## ADDED Requirements

### Requirement: Modular property-based vault seed generator
The web application (`apps/web`) MUST provide a modular, property-based vault seed generator in `src/test/generators/` that populates valid content nodes, schema/type definitions, query definitions, and graph edges.

#### Scenario: Seed deterministic graph vault with fixed seed
- **WHEN** `generateVault({ preset: 'demo', seed: 42 })` is invoked
- **THEN** it MUST return a `GraphSession` pre-populated with a deterministic, reproducible personal knowledge vault
- **AND** all generated nodes and properties MUST satisfy `@canopy/graph` Zod schema validation rules

#### Scenario: Seed high-density stress graph vault
- **WHEN** `generateVault({ preset: 'large' })` is invoked
- **THEN** it MUST return a high-density graph containing 500+ nodes and 1000+ edges for performance testing

### Requirement: Decoupled WASM renderer resolution (Invariant 10)
Content nodes MUST hold pure graph properties (`Node`, `Edge`, `Properties`). Rendering formats (Markdown, rST, AsciiDoc, HTML, custom block formats) MUST be resolved dynamically at runtime via `ViewDefinition` and `RendererDefinition` nodes pointing to WASM plugin entry points.

#### Scenario: Dynamic renderer resolution for content nodes
- **WHEN** the UI engine renders a content node
- **THEN** it MUST query the graph for connected `defaultView` edges to determine the target `ViewDefinition` and `RendererDefinition`
- **AND** it MUST NOT hardcode format-specific rendering logic directly into content nodes

### Requirement: Unified execution engine for E2E and dev server launch
Both automated Playwright test suites and manual development server launches MUST boot using the exact same property-based vault generator logic.

#### Scenario: Execute automated Playwright E2E user journeys
- **WHEN** `bun --filter @canopy/web test:e2e` is run
- **THEN** Playwright specs in `apps/web/e2e/user-journeys.e2e.ts` MUST seed the graph vault using `generateVault` and assert end-to-end user workflows (command palette navigation, block editing, query execution, schema creation)

#### Scenario: Boot manual dev server with pre-populated demo seed
- **WHEN** `bun --filter @canopy/web dev:demo` is executed in non-production environment
- **THEN** the web application MUST auto-seed IndexedDB on boot if storage is uninitialized using `generateVault({ preset: 'demo' })`
