# Design: Property-Based Vault Seed Generator & Unified UI Test Harness

## Context

Canopy requires realistic, reproducible graph vault datasets ("vaults") to validate user experience, query correctness, schema management, and UI rendering.
Currently, unit and E2E tests manually construct minimal ad-hoc nodes.
This design establishes a modular, property-based graph seed generator in `apps/web/src/test/generators/` that powers both automated Playwright E2E test runs and interactive manual development (`bun run dev:demo`).

## Architectural Invariants & Data Model Alignment

1. **Graph-Native Data Model**: All vault content consists of fundamental graph entities: `Node`, `Edge`, and `Properties`.
2. **Schema & Type Coercion**: `Namespace`, `PropertyType`, `NodeType`, and `EdgeType` nodes coerce and structure graph data within a vault.
3. **Decoupled Renderer Resolution**: Rendering formats (Markdown, rST, AsciiDoc, HTML, custom block formats) are decoupled from content storage. Content nodes hold raw data properties. Rendering behavior is resolved dynamically via `ViewDefinition` and `RendererDefinition` nodes linking to WASM plugin entry points.

## System Architecture

```
                  ┌───────────────────────────────┐
                  │ Property-Based Vault Generator│
                  │   (src/test/generators/)     │
                  └──────────────┬────────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
          Preset: "demo" (small)       Preset: "large" (stress)
                   │                           │
         ┌─────────┴─────────┐       ┌─────────┴─────────┐
         ▼                   ▼       ▼                   ▼
   Playwright E2E      Manual Dev  Playwright E2E      Manual Dev
    Auto Runner        Browser App  Stress Tests       Browser App
```

### 1. Modular Building Blocks (`apps/web/src/test/generators/`)

- `node-generators.ts`: Generates content nodes (`TextBlock`, `CodeBlock`, `MarkdownNode`, custom formats) with property-based text, metadata, and tags.
- `schema-generators.ts`: Generates `Namespace`, `PropertyType`, `NodeType`, and `EdgeType` graph nodes adhering to `@canopy/graph` validation rules.
- `query-generators.ts`: Generates `QueryDefinition` nodes containing query DSL filter steps and property selection arrays.
- `graph-generators.ts`: Assembles connected graph vaults linking content nodes, schemas, queries, and directional edges.

### 2. Vault Seed Configuration (`generateVault`)

```typescript
export interface GenerateVaultOptions {
  readonly preset: 'demo' | 'large';
  readonly seed?: number;
}

export function generateVault(options: GenerateVaultOptions): Effect.Effect<GraphSession, GraphError>;
```

- `seed`: Optional seedable pseudo-random RNG (e.g. `fast-check` or linear congruential generator). When specified, output graph structure is 100% deterministic and reproducible.
- `preset`:
  - `'demo'`: Generates a balanced personal knowledge vault (~25 nodes, 40 edges, custom node types, query definitions, and renderer bindings).
  - `'large'`: Generates a high-density stress graph (~500+ nodes, 1000+ edges) for performance testing.

### 3. Unified Execution Engine

#### Automated E2E Runner (`playwright test`)
Playwright specs in `apps/web/e2e/user-journeys.e2e.ts` call `generateVault({ preset: 'demo', seed: 42 })` during test setup to assert:
1. Command palette navigation and node search (`Ctrl+P`).
2. Content editing and debounced auto-saves.
3. Dynamic view rendering resolution.
4. Query execution and property aggregation.
5. Schema creation and node instantiation.

#### Manual Dev Server Launch (`bun --filter @canopy/web dev:demo`)
- Adds `dev:demo` script to `apps/web/package.json`: `CANOPY_DEMO_SEED=true vite`.
- On boot, the web app checks `CANOPY_DEMO_SEED`. If set and local storage is uninitialized, it executes `generateVault({ preset: 'demo' })` to seed IndexedDB, allowing developers to manually inspect and test the UI with pre-populated data.

## Adversarial Review and Mitigations

### Resource and Performance

#### Risk
Large generated graph vaults causing slow Playwright test initialization or memory exhaustion in `fake-indexeddb`.

#### Mitigation
- Keep default `'demo'` preset lean (~25 nodes) so automated E2E test runs complete in under 5 seconds.
- Isolate the `'large'` preset for dedicated performance benchmarks.

### Failure Modes and Edge Cases

#### Risk
Randomized seed property generators creating malformed payloads that break `@canopy/graph` Zod schema validation.

#### Mitigation
- Wrap all generator outputs in Zod schema parse checks at generation time to fail fast with explicit error paths if a generator produces an invalid property or node payload.

### Migration and Compatibility

#### Risk
Evolving domain schemas breaking existing Playwright E2E assertions.

#### Mitigation
- Generators use `@canopy/graph` domain ops (`createNode`, `createNodeType`) rather than hardcoded raw JSON, ensuring all generated vaults automatically conform to current schema definitions.

## Testing Strategy

- Unit test generator modules in `apps/web/src/test/generators/__tests__/generators.test.ts` to verify deterministic output when passed a fixed seed.
- Execute Playwright suite (`bun --filter @canopy/web test:e2e`) to verify full user journey assertions against the seeded demo vault.
