# Design: Property-Based Vault Seed Generator & Unified UI Test Harness

## Context

Canopy is a graph-based personal knowledge management system. Its canonical design document (`docs/design/2025-01-21-canopy-design-v0.1.md`) and architectural invariants specify an "everything is a node" data model where content nodes hold pure properties (`Node`, `Edge`, `Properties`), while rendering formats (Markdown, rST, AsciiDoc, HTML, custom block formats) are resolved dynamically via `ViewDefinition` and `RendererDefinition` nodes pointing to WASM plugin entry points.

Currently, `apps/web` contains basic unit tests and partial E2E specs (`smoke.e2e.ts`, `block-editor.e2e.ts`).
To validate product utility, end-to-end user workflows, schema authoring, and rendering performance under realistic vault conditions, Canopy needs a composable, property-based graph seed generator that powers both automated Playwright test runs and manual browser development (`bun --filter @canopy/web dev:demo`).

## Goals / non-goals

### Goals

- Build modular property-based generator building blocks in `apps/web/src/test/generators/` for content nodes, schema/type definitions, queries, and graph edges.
- Support deterministic seeded generation (`seed: 42`) for 100% reproducible E2E test runs, as well as randomized seeding for stress testing.
- Provide seed presets (`'demo'` for a ~25-node personal knowledge graph; `'large'` for a 500+ node performance graph).
- Unified execution engine: both Playwright automated E2E test runs (`apps/web/e2e/user-journeys.e2e.ts`) and manual dev server launches (`bun run dev:demo`) boot from the exact same generator logic.
- Codify Architectural Invariant 10: rendering formats (Markdown, rST, AsciiDoc, HTML, custom formats) are decoupled from content storage and resolved dynamically via `ViewDefinition` and `RendererDefinition` graph nodes linking to WASM plugin components.

### Non-goals

- Hardcoding rendering logic or formatting assumptions directly inside content nodes.
- Maintaining separate, out-of-sync mock fixture loaders for E2E tests vs manual dev server runs.

## Decisions

### Decision 1: Modular Generator Building Blocks (`apps/web/src/test/generators/`)

The generator suite will be structured as focused, reusable domain modules:

- `node-generators.ts`: Generates content nodes (`TextBlock`, `CodeBlock`, `MarkdownNode`, custom formats) with property-based text, metadata, and tags.
- `schema-generators.ts`: Generates `Namespace`, `PropertyType`, `NodeType`, and `EdgeType` graph nodes adhering to `@canopy/graph` validation rules.
- `query-generators.ts`: Generates `QueryDefinition` nodes containing query DSL filter steps and property selection arrays.
- `graph-generators.ts`: Assembles connected graph vaults linking content nodes, schemas, queries, and directional edges.

### Decision 2: Vault Seed API (`generateVault`)

```typescript
export interface GenerateVaultOptions {
  readonly preset: 'demo' | 'large';
  readonly seed?: number;
}

export function generateVault(options: GenerateVaultOptions): Effect.Effect<GraphSession, GraphError>;
```

- `seed`: Optional seedable pseudo-random RNG (e.g. `fast-check` or seedable LCG). Specifying a seed produces identical, reproducible graph data.
- `preset`:
  - `'demo'`: Generates a balanced personal knowledge vault (~25 nodes, 40 edges, custom node types, query definitions, and renderer bindings).
  - `'large'`: Generates a high-density stress graph (~500+ nodes, 1000+ edges) for performance testing.

### Decision 3: Decoupled Renderer Resolution (Invariant 10)

Content nodes store pure graph properties (`Node`, `Edge`, `Properties`).
Rendering behavior is resolved dynamically at runtime:
1. The UI inspects the node's `NodeType`.
2. The UI queries the graph for connected `defaultView` edges pointing to a `ViewDefinition` node.
3. The `ViewDefinition` references a `RendererDefinition` node (e.g. `system:renderer:markdown`, `system:renderer:code`, or a custom plugin renderer node) specifying the WASM guest entry point.

### Decision 4: Unified Execution Engine (Automated E2E & Manual Dev)

- **Automated Mode (`playwright test`)**: E2E specs in `apps/web/e2e/user-journeys.e2e.ts` call `generateVault({ preset: 'demo', seed: 42 })` during setup before asserting:
  - Command palette navigation (`Ctrl+P`).
  - Content editing and debounced auto-commit.
  - Query execution and property aggregation.
  - Schema creation and node instantiation.
- **Manual Mode (`bun --filter @canopy/web dev:demo`)**: Adds `dev:demo` script to `apps/web/package.json`: `CANOPY_DEMO_SEED=true vite`. On boot, the web app checks `CANOPY_DEMO_SEED`. If set and local storage is uninitialized, it executes `generateVault({ preset: 'demo' })` to seed IndexedDB.

### Decision 5: Thin, convention-driven initial schemas

System nodes, node types, and property types start thin and follow minimal, conventional schemas (e.g. `title`, `content`, `tags`, basic `project`/`task` types). Complex schema structures are avoided until exact domain requirements are dialed in through iterative testing.

## Adversarial review and mitigations

### Resource and performance overhead

#### Risk

Large generated graph vaults causing slow Playwright test initialization or memory exhaustion in `fake-indexeddb`.

#### Mitigation

- Keep default `'demo'` preset lean (~25 nodes) so automated E2E test runs complete in under 5 seconds.
- Isolate the `'large'` preset for dedicated performance benchmarks.

### Failure modes and edge cases

#### Risk

Randomized seed property generators creating malformed payloads that break `@canopy/graph` Zod schema validation.

#### Mitigation

- Wrap all generator outputs in Zod schema parse checks at generation time to fail fast with explicit error paths if a generator produces an invalid property or node payload.

### Security and isolation

#### Risk

Dev seed environment flag (`CANOPY_DEMO_SEED=true`) leaking into production builds or overwriting existing user data without confirmation.

#### Mitigation

- Only permit `CANOPY_DEMO_SEED` execution when `process.env.NODE_ENV !== 'production'`.
- Only seed if the target IndexedDB storage is empty (uninitialized).

### Migration and backward compatibility

#### Risk

Evolving domain schemas breaking existing Playwright E2E assertions.

#### Mitigation

- Generators use `@canopy/graph` domain ops (`createNode`, `createNodeType`) rather than hardcoded raw JSON, ensuring all generated vaults automatically conform to current schema definitions.

## Testing strategy

### Unit testing

- Test generator modules in `apps/web/src/test/generators/__tests__/generators.test.ts` to verify deterministic output when passed a fixed seed.

### Integration & E2E testing

- Execute Playwright suite (`bun --filter @canopy/web test:e2e`) to verify full user journey assertions against the seeded demo vault.
