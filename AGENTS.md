# Canopy

Canopy is a graph-based personal knowledge management system.
It treats all content as nodes in a graph with strict typing, meta-circular definition capabilities, and CRDT-based synchronization for offline-first operation.

## Package dependency graph

Run the following command to verify the current dependency graph:

```bash
pnpm list -r --depth 1
```

## Architectural invariants

1.  `@canopy/types` has zero runtime dependencies—pure TypeScript types only.
2.  `@canopy/core` owns the graph model—other packages do not directly manipulate graph state.
3.  Yjs integration lives in `@canopy/sync`, not scattered across packages.
4.  `@canopy/query` is isolated to enable swapping Cypher for ISO GQL later.
5.  UI components are stateless—`@canopy/ui` receives data via props, does not fetch or mutate.
6.  Zod schemas in `@canopy/schema` are the source of truth for runtime validation.
    `@canopy/schema` also provides strict constructors and type guards for domain types.
7.  All type properties are `readonly`.
8.  No mutations—functions return new values, never modify arguments.
9.  No raw primitives in domain types—use branded types and domain-specific wrappers.

## Development workflow

| Task | Command |
| :--- | :--- |
| Install dependencies | `pnpm install` |
| Run tests | `pnpm test run` |
| Build all packages | `pnpm build` |
| Lint codebase | `pnpm lint` |
| Type check | `pnpm typecheck` |

## Environment setup

We use `mise` to align local tool versions (Node.js) with CI.
Versions are defined in `mise.toml` and must match `package.json` (verified via `pnpm lint`).

### Local commands
*   Install tools: `mise install`
*   Activate shell: `eval "$(mise activate bash)"` (or add to `~/.bashrc`)
*   Trust config: `mise trust`

## Programming style requirements

All code must follow a functional programming style, avoiding mutations and side effects.
Use `readonly` modifiers on all type properties and prefer `ReadonlyArray<T>` or `readonly T[]`.
Build domain types from the bottom up, avoiding `any` or `Record<string, unknown>`.
Strict typing is enforced; use branded types for identifiers and `unknown` instead of `any` where appropriate.
Documentation in `AGENTS.md` files must follow the one-sentence-per-line rule.

## Query Engine (@canopy/query)

The `@canopy/query` package provides a structured execution engine for graph queries.
It uses an intermediate representation (IR) to define queries, decoupling the builder/parser from execution.
The API follows a fluent builder pattern for constructing queries programmatically.
Queries are executed against a `Graph` instance and return a `QueryResult`.
The engine supports filtering, traversal, sorting, and limiting results.
Future iterations will introduce a Cypher parser that generates the IR directly.
This design prepares for a potential migration to ISO GQL without rewriting the execution logic.
