# Canopy

Canopy is a graph-based personal knowledge management system.

## Design Documentation

The canonical design document is located at `docs/design/2025-01-21-canopy-design-v0.1.md`.

## Package dependency graph

Run the following command to verify the current dependency graph:

```bash
bun pm ls --all
```

## Architectural invariants

1.  `@canopy/types` has zero runtime dependencies—pure TypeScript types only.
2.  `@canopy/core` owns the graph model—other packages do not directly manipulate graph state.
    - New graphs are automatically bootstrapped with system nodes (NodeType, EdgeType, etc.).
    - Well-known system IDs are defined in `@canopy/core/system`.
3.  Yjs integration lives in `@canopy/sync`, not scattered across packages.
4.  `@canopy/query` is isolated to enable swapping Cypher for ISO GQL later.
5.  UI components are stateless—`@canopy/ui` receives data via props, does not fetch or mutate.
6.  Zod schemas in `@canopy/schema` are the source of truth for runtime validation.
    `@canopy/schema` also provides strict constructors and type guards for domain types.
7.  All type properties are `readonly`.
8.  No mutations—functions return new values, never modify arguments.
9.  No raw primitives in domain types—use branded types and domain-specific wrappers.

## Development workflow

| Task                 | Command             |
| :------------------- | :------------------ |
| Install dependencies | `bun install`       |
| Run tests            | `bun test`          |
| Build all packages   | `bun run build`     |
| Lint codebase        | `bun run lint`      |
| Type check           | `bun run typecheck` |

## Environment setup

We use `mise` to align local tool versions (Node.js) with CI.

- Install tools: `mise install`
- Activate shell: `eval "$(mise activate bash)"`
- Trust config: `mise trust`

## Task tracking (Beads)

We use Beads (`bd`) for distributed task tracking.
Issues are stored in `.beads/` and versioned with git.
Use `bun run bd` to execute commands.

## Programming style requirements

All code must follow a functional programming style, avoiding mutations and side effects.
Use `readonly` modifiers on all type properties and prefer `ReadonlyArray<T>` or `readonly T[]`.
Build domain types from the bottom up, avoiding `any` or `Record<string, unknown>`.
Strict typing is enforced; use branded types for identifiers and `unknown` instead of `any` where appropriate.
Documentation in `AGENTS.md` files must follow the one-sentence-per-line rule.

## Landing the Plane (Session Completion)

**MANDATORY WORKFLOW:**

1. **File issues** for remaining work.
2. **Run quality gates** (tests, linters, builds).
3. **Update issue status**.
4. **PUSH TO REMOTE** (MANDATORY):
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** and **Verify**.
6. **Hand off** with context.

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds.
- If push fails, resolve and retry until it succeeds.
