# Canopy

Canopy is a graph-based personal knowledge management system.

## Design documentation

Read [Canopy v0 architecture](docs/architecture/canopy-v0-architecture.md) for the target `canopy.v0` server-first architecture, TypeSpec API contracts, and domain model.
Read [Core tenets](docs/architecture/core-tenets.md) for overarching product intent and [Core data model and type system](docs/design/2026-02-06-core-data-model.md) for the initial kernel foundation.
The [original design](docs/design/2025-01-21-canopy-design-v0.1.md) provides historical context; `docs/architecture/canopy-v0-architecture.md` and current EGM `README.md` contracts supersede conflicting details.

Canopy is intended to become a suite of products for PKMS, remote memory, graph knowledge database access, and a secure plugin ecosystem, sharing one core domain model.
Graph-defined types, queries, views, and renderers are foundational; rendering applications resolve these definitions to supported native or WASM components.
Agents, CLI, MCP, and other API surfaces build on that domain.
Before changing a design or enriching a bead, read the core tenets and distinguish current contracts, product intent, and open decisions.
Do not narrow the product to the current web UI or promote an unresolved feature into a kernel invariant.

## Package dependency graph

Run the following command to verify the current dependency graph:

```bash
bun pm ls --all
```

## Package layout

`docs/architecture/bounded-contexts.md` is the single source of truth for the package list, dependency graph, and per-package scope.
`tools/check-dependency-graph.ts` mechanically enforces that its mermaid diagram matches `package.json`, so it can't drift — do not duplicate the package enumeration here.

## Architectural invariants

1. `@canopy/graph` is the leaf — no `@canopy/*` imports.
   Bootstrap, system IDs, and the `EventLogStore` port live here.
2. No package imports `yjs` or `y-protocols`. The event log is the sole persistence and sync mechanism.
3. Storage adapters implement `EventLogStore` (defined in `@canopy/graph`); they do not redefine the port.
4. UI components are stateless; they receive data via props and do not fetch or mutate.
5. Zod schemas in `@canopy/graph` are the source of truth for runtime validation.
6. All type properties are `readonly`.
   No mutations — functions return new values, never modify arguments.
7. No raw primitives in domain types — use branded IDs and domain wrappers.
8. Errors are returned as `Result<T, E>`, not thrown.
9. No `any` or `Record<string, unknown>` — use `unknown` with narrowing.
10. Rendering is decoupled from content storage — content nodes hold pure properties (nodes, edges, properties); rendering format resolution (Markdown, rST, AsciiDoc, HTML, custom formats) is dynamically performed via `ViewDefinition` and `RendererDefinition` graph nodes referencing WASM plugin components.

## Development workflow

Refer to `mise.toml` for task definitions, dependencies, and execution entrypoints (`mise tasks` / `mise run <task>`).
Run `mise run check` to execute the full quality gate pipeline in CI order.

Run `bun run build` before `bun run lint` on a fresh checkout.
The `functional/prefer-immutable-types` rule resolves cross-package types through each package's `dist/index.d.ts`; without those the rule reports `actual: Unknown` and fails ~185 checks.
CI runs Build → Lint → Typecheck → Test for this reason.

## Environment setup

We use `mise` to align local tool versions (Node.js) with CI.

- Install tools: `mise install`
- Activate shell: `eval "$(mise activate bash)"`
- Trust config: `mise trust`

## Linting rules — escape hatches

`eslint-plugin-functional` is on by default for every package and `apps/web`.
When a third-party type triggers `functional/prefer-immutable-types` (e.g. Zod, React, xyflow), add a narrow pattern to `ignoreTypePattern` in `eslint.config.mjs` with a one-line source comment.
Do NOT disable `prefer-immutable-types` or `type-declaration-immutability` per-package — adapter public signatures must stay immutable even when the implementation mutates encapsulated state.
For genuinely unreplaceable single-line cases (e.g. React 18 `createRoot(document.querySelector('#root')!)`), use a localized `// eslint-disable-next-line <rule> -- <reason>`.
Banned: `@ts-ignore` (use `@ts-expect-error <description>`), non-null assertions `!`, and the `.*` catch-all in `ignoreTypePattern`.
Always add transpiled guest WASM shims, third-party code, and helper scripts (e.g., `**/transpiled/**/*`) to the global `ignores` list in `eslint.config.mjs`.
This prevents functional and prettier validation checks from failing on generated code.

Two guards keep escape hatches from accreting (`canopy-v9o.1`):

- `reportUnusedDisableDirectives: 'error'` in `eslint.config.mjs` rejects any `eslint-disable` that suppresses nothing — a stale directive left after a refactor fails lint.
- `tools/check-eslint-disable-ceiling.ts` (wired into `bun run lint`) ratchets the total directive count against `tools/eslint-disable-baseline.json`; adding a disable fails CI.
  The ceiling only ratchets down: each rewrite that removes directives lowers it via `bun tools/check-eslint-disable-ceiling.ts --update`.
  Raising it requires an explicit, reviewed one-line diff — the default answer to a lint failure is to eliminate the directive, not raise the ceiling.

## Performance-based modules — perf/load tests required

A module deemed performance-based must carry a perf/load test (even a basic one early, fleshed out as the app matures).
A change touching a perf-based module must not land without that test present and green.
This exists so perf-sensitive code (where mutation or an O(delta) algorithm was a deliberate choice) is never rewritten blind — measure, don't guess.

Perf-based module inventory:

| Module                                         | Benchmark                                                | Status  |
| :--------------------------------------------- | :------------------------------------------------------- | :------ |
| `packages/graph/src/indexes.ts`                | `packages/graph/scripts/bench-index-maintenance.ts`      | Covered |
| `packages/graph/src/incremental-projection.ts` | `packages/graph/scripts/bench-incremental-projection.ts` | Covered |

## Landing the Plane (Session Completion)

**MANDATORY WORKFLOW:**

1. **File issues** for remaining work.
2. **Run quality gates** (tests, linters, builds).
3. **Update issue status**.
4. **PUSH TO REMOTE** (MANDATORY):
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** and **Verify**.
6. **Hand off** with context.

**Critical rules:**

- Work is NOT complete until `git push` succeeds.
- If push fails, resolve and retry until it succeeds.

## Handling install failures

If `bun install` fails due to a package being too new (we enforce a minimum release age for newly published packages), do not retry the installation of the same version.
Instead, find and install an older, established version of the package that meets the release age requirement.

## Testing WASM and module resolution in Bun

For testing paths that use Vite config aliases, duplicate the path mappings in both `tsconfig.json` and `tsconfig.check.json` under `paths` so Bun's test runner can resolve them.
When running integration or unit tests for components that load transpiled WASM plugins, import the pure JavaScript plugin implementation (`guest.js`) instead of the transpiled WASM wrapper (`plugin.js`) to prevent Bun from throwing errors on unsupported Node.js bindings (such as `process.binding("tcp_wrap")`).
Vite is currently used to build and serve the front-end React single-page application (`apps/web`), whereas Bun is used for packaging, running scripts, and executing tests.
Because Bun has built-in module bundling and web-based testing capabilities, a future task is tracked under `canopy-kjg` to investigate consolidating build tools by replacing Vite with Bun's native bundler.
Guest plugin code imports WIT component-model interfaces via the `canopy:` URI scheme (e.g. `from 'canopy:graph/plugin'`); knip parses the scheme prefix as a package name, so `apps/web`'s `knip.json` keeps `"canopy"` in `ignoreDependencies` to suppress that false positive — it is not a real npm package.

## Issue tracking

This project uses `bd` (beads) for issue tracking.
Run `bd prime` for full workflow context before creating or updating any issues.
Key commands: `bd ready` (unblocked work), `bd create "Title" --type task` (new issue), `bd close <id>` (complete).
Task beads must not be created or set to `in_progress` until the corresponding design proposal has successfully passed the adversarial review phase.
All git worktrees share one embedded bd database, so grab work only with `bd update <id> --claim` (atomic and conflict-checked) — never a manual status set — and parallel worktree sessions stay safe.

## Specs and EGM contracts

`docs/architecture/` documents and bottom-up EGM `README.md` files in each package/app directory are the sole specification system.
Every package and app directory maintains a `README.md` with `Overview`, `Interface`, `Invariants`, `Side Effects`, and `Verification` sections that reflect its actual exported API and behavior.
Update the owning `README.md` contract whenever a change alters public interfaces, invariants, or side effects, and verify zero EGM drift before closing work.

## Jules agents

See `.jules/AGENTS.md`.
Check existing tooling and `.jules/` prompt files before adding a new automation script.

## Bounded agent delivery

Before staging or claiming implementation Beads, verify completed prerequisites, current `docs/architecture/` and EGM `README.md` contracts, file ownership, isolation, and acceptance evidence.
Distinguish current implementation, approved `canopy.v0` contracts, and exploratory product intent; do not turn brainstorming epics into implementation assignments.

With authoritative local Beads access, claim atomically using `bd update <id> --claim`.
Prefer isolated worktrees or sandboxes; use read-only scouts until isolation and ownership are established.
Concurrent write scopes must be disjoint and consume compatible contracts.
Give shared generated files and manifests one writer, and keep coupled contract/consumer changes with one integration owner until a building baseline allows independent work.

Stop dependent work when a contract is missing, contradictory, or requires an unapproved observable change, and report the mismatch to the contract owner.
Exercise real persistence, transport, or isolation boundaries where affected; stub success alone is insufficient.
The integration owner verifies the combined result, EGM `README.md` alignment, and `mise run check` before landing implementation.

## Docker Sandbox execution

To run checks via the Docker Sandbox environment, execute:
```bash
sbx env exec .sbx/sbxenv.yaml -- mise run check
```
