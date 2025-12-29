# AGENTS.md

## 1. Handoff protocol

- **Core -> UI**: Core exposes Observables or hooks for state updates. UI components should not modify core state directly but dispatch actions.
- **Schema -> Core**: Core relies on Zod schemas for runtime validation of nodes and edges.
- **Query -> Core**: Query engine executes Cypher queries against the graph state managed by Core.

## 2. Type boundaries

- **packages/schema**: Defines the canonical types (Nodes, Edges, Properties) using Zod. Exports inferred TypeScript types.
- **packages/core**: Internal graph logic, indexing, and CRDT synchronization.
- **packages/ui**: View-specific types. Logic should be minimal.

## 3. State ownership

- **Graph State**: Owned by `packages/core`.
- **Sync State**: Managed by `packages/core` (using Yjs).
- **UI State**: Local component state or context in `packages/ui` and apps.

## 4. Integration points

- **Query Engine -> Storage**: The query engine operates on the in-memory graph structure provided by Core.
- **Storage -> Sync**: Storage updates trigger CRDT updates and vice-versa.
- **UI -> Query**: UI components construct queries and pass them to the Query Executor in Core.

## 5. Testing strategy

- **Unit**: Test pure functions in `schema` and `query`. Test graph logic in `core` mocking dependencies.
- **Integration**: Test the interaction between Query and Core. Test CRDT sync.
- **E2E**: Playwright tests for `apps/web`.

## 6. Development workflow

- **Branch Naming**: `feat/`, `fix/`, `chore/` prefix.
- **Commit Format**: Conventional Commits (e.g., `feat(core): add node indexing`).
- **PR Requirements**: All CI checks pass, code review approval.
