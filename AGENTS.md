# Canopy

Canopy is a graph-based personal knowledge management system.

## Design Documentation

The canonical design document is located at `docs/design/2025-01-21-canopy-design-v0.1.md`.

## Package dependency graph

Run the following command to verify the current dependency graph:

```bash
bun pm ls --all
```

## Package layout

See `docs/architecture/bounded-contexts.md` for the dependency graph and per-package scope.

Six packages:

- `@canopy/graph` — kernel (types, schemas, projection, ops, validation, bootstrap, history, event bus, `GraphSession`, `EventLogStore` port).
- `@canopy/queries` — query DSL and executor.
- `@canopy/settings` — settings cascade and `UserSetting` creation.
- `@canopy/storage` — storage contract re-exports plus the dependency-free in-memory `EventLogStore`.
- `@canopy/storage-indexeddb` — `EventLogStore` over IndexedDB (`idb`) plus the graph registry.
- `@canopy/storage-sqlite` — `EventLogStore` over SQLite (`sql.js`).

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

## Development workflow

| Task                 | Command             |
| :------------------- | :------------------ |
| Install dependencies | `bun install`       |
| Run tests            | `bun test`          |
| Build all packages   | `bun run build`     |
| Lint codebase        | `bun run lint`      |
| Type check           | `bun run typecheck` |

Run `bun run build` before `bun run lint` on a fresh checkout.
The `functional/prefer-immutable-types` rule resolves cross-package types through each package's `dist/index.d.ts`; without those the rule reports `actual: Unknown` and fails ~185 checks.
CI runs Build → Lint → Typecheck → Test for this reason.

## Environment setup

We use `mise` to align local tool versions (Node.js) with CI.

- Install tools: `mise install`
- Activate shell: `eval "$(mise activate bash)"`
- Trust config: `mise trust`

## Programming style requirements

All code must follow a functional programming style, avoiding mutations and side effects.
Use `readonly` modifiers on all type properties and prefer `ReadonlyArray<T>` or `readonly T[]`.
Build domain types from the bottom up, avoiding `any` or `Record<string, unknown>`.
Strict typing is enforced; use branded types for identifiers and `unknown` instead of `any` where appropriate.
Documentation in `AGENTS.md` files must follow the one-sentence-per-line rule.

### Linting rules — escape hatches

`eslint-plugin-functional` is on by default for every package and `apps/web`.
When a third-party type triggers `functional/prefer-immutable-types` (e.g. Zod, React, xyflow), add a narrow pattern to `ignoreTypePattern` in `eslint.config.mjs` with a one-line source comment.
Do NOT disable `prefer-immutable-types` or `type-declaration-immutability` per-package — adapter public signatures must stay immutable even when the implementation mutates encapsulated state.
For genuinely unreplaceable single-line cases (e.g. React 18 `createRoot(document.querySelector('#root')!)`), use a localized `// eslint-disable-next-line <rule> -- <reason>`.
Banned: `@ts-ignore` (use `@ts-expect-error <description>`), non-null assertions `!`, and the `.*` catch-all in `ignoreTypePattern`.
Always add transpiled guest WASM shims, third-party code, and helper scripts (e.g., `**/transpiled/**/*`) to the global `ignores` list in `eslint.config.mjs`.
This prevents functional and prettier validation checks from failing on generated code.

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

## Issue tracking

This project uses `bd` (beads) for issue tracking.
Run `bd prime` for full workflow context before creating or updating any issues.
Key commands: `bd ready` (unblocked work), `bd create "Title" --type task` (new issue), `bd close <id>` (complete).
Task beads must not be created or set to `in_progress` until the corresponding design proposal has successfully passed the adversarial review phase.

## Specs

This project uses OpenSpec for spec-driven development.
Run `bunx openspec list` to see current changes and their status.
Use `/opsx:propose`, `/opsx:apply`, `/opsx:archive` slash commands to work with specs.
Specs live in `openspec/changes/` and follow the `proposal → design → tasks` artifact flow.
All design proposals must undergo a mandatory adversarial review phase prior to staging implementation tasks.
This phase occurs after drafting the `design.md` artifact but before creating `tasks.md` or staging beads issues.
The design proposal must include a dedicated `## Adversarial review and mitigations` section.
This section must systematically analyze resource and performance overhead, failure modes and edge cases, security and isolation, and migration/backward compatibility risks.
For every identified risk, the design must document a concrete, actionable mitigation.
Implementation tasks and beads issues must not be created, claimed, or executed until the adversarial review is complete and all mitigations are approved.

## Jules agents

See `.jules/AGENTS.md`.

## Agent constraints and quality control

To prevent agent sprawl, inconsistent code, and high token costs:

- Avoid adding new files or scripts to the project root unless absolutely necessary.
- Follow the package layout and bounded contexts.
- Keep components and context provider files focused and modular.
- Refactor and split files if they grow too large (e.g. over 300 lines of code).
- Before creating a new background or automated script, ensure it fits under existing tooling or `.jules/` prompt files.
