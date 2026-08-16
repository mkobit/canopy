# kernel-functional-toolkit Specification

## Purpose

The standing policy for which functional toolkit each package tier uses, so the `eslint-disable` elimination epic (`canopy-v9o.1`) and future work rewrite the kernel one way: kernel-tier packages (`@canopy/graph`, `@canopy/queries`, `@canopy/settings`, `@canopy/storage*`) stay Effect-free with plain-functional patterns and the existing `Result<T, E>`; `effect` is confined to the app/adapter boundary; shared pure helpers home in the leaf `@canopy/graph` rather than a bucket package. Decided in `docs/architecture/decisions.md` (2026-08-16, `canopy-v9o.1.1`).

## Requirements

### Requirement: Kernel and non-app packages stay Effect-free

`@canopy/graph`, `@canopy/queries`, `@canopy/settings`, and every `@canopy/storage*` adapter SHALL NOT declare `effect` as a dependency, and their source SHALL NOT import from `effect`.
Fallible operations in these packages SHALL use the existing `Result<T, E>` from `@canopy/graph`'s `result.ts`; iteration and accumulation SHALL use plain-functional patterns (`map`/`filter`/`reduce`/`fold`, `readonly` structural updates) rather than an effect runtime.

#### Scenario: A kernel-tier package adds effect

- **WHEN** a reviewer or lint check inspects `package.json` and imports of `@canopy/graph`, `@canopy/queries`, `@canopy/settings`, or a `@canopy/storage*` package
- **THEN** no `effect` entry appears in `dependencies`/`devDependencies` and no `from 'effect'` import appears in `src/`

#### Scenario: A kernel rewrite needs error handling

- **WHEN** a rewrite bead removes a `functional/no-try-statements` or `functional/no-throw-statements` disable in a kernel-tier package
- **THEN** the rewrite returns `Result<T, E>` (or uses a single boundary helper that catches an external throw and returns `err(...)`), not an `Effect` or `Either`

### Requirement: Effect stays at the app/adapter boundary

`effect` SHALL remain permitted only in `@canopy/api-adapter` and the apps (`apps/web`, `apps/cli`, `apps/daemon`, `apps/clip-host`), where it already serves as an outer runner.
Rewrites in those packages MAY use Effect combinators; rewrites in kernel-tier packages MAY NOT.

#### Scenario: Adapter or app rewrite proceeds independently

- **WHEN** a rewrite bead targets `@canopy/api-adapter`, `apps/web`, `apps/cli`, `apps/daemon`, or `apps/clip-host`
- **THEN** it may proceed without waiting on kernel-tier decisions and may express the rewrite with Effect

### Requirement: Shared pure helpers are homed in the leaf, not a bucket package

The project SHALL NOT create a general-purpose `@canopy/functional` (or equivalent grab-bag) package.
A pure helper that genuinely recurs across kernel-tier packages (for example a test `assertDefined`, a `Result`-aware fold/`traverse`, or an immutable `Map`/`Set` update) SHALL be added as a named, domain-neutral export of `@canopy/graph` — the leaf every package already imports — and only once a second caller exists.

#### Scenario: A rewrite wants to share a helper

- **WHEN** a rewrite finds the same pure helper needed in a second kernel-tier package
- **THEN** the helper is exported from `@canopy/graph` under a named export, not from a new utility package, and a single-caller helper stays inline

### Requirement: Plain-functional is the ratified playbook default

The elimination playbook (`docs/research/2026-08-15-eliminating-eslint-disables-playbook.md`) SHALL state plain-functional as the ratified default with the Effect-conditional hedge removed, and its recurring-helper guidance SHALL point at the leaf-homed helpers.
The decision SHALL be recorded as a dated ADR entry in `docs/architecture/decisions.md`.

#### Scenario: A remote agent reads the playbook before a rewrite

- **WHEN** an agent opens the playbook to execute a kernel-tier rewrite bead
- **THEN** it finds an unconditional plain-functional instruction (no "if Effect is chosen, adjust") and a pointer to the ADR

### Requirement: The `@canopy/graph` split is evaluated and recorded

This decision SHALL record that no `@canopy/graph` split is motivated by the disable-elimination work, and that any future split remains owned by the package-graph track (`canopy-jxw`) rather than this epic.

#### Scenario: Someone proposes splitting the leaf to reduce disables

- **WHEN** a future contributor cites disable counts as a reason to split `@canopy/graph`
- **THEN** the ADR shows the split was evaluated and declined for this purpose, directing the discussion to `canopy-jxw`

### Requirement: The decision names its revisit triggers

The ADR SHALL name the concrete conditions under which the Effect-free-kernel decision is reopened, so it is revisited on evidence rather than re-argued ad hoc.

#### Scenario: A trigger condition is observed

- **WHEN** one of the named triggers occurs (for example: kernel-tier code starts needing structured concurrency, cancellation, or typed dependency injection that plain-functional patterns cannot express cleanly; or the hand-rolled `Result` demonstrably diverges from adapter Effect error handling in a way that causes real bugs)
- **THEN** the decision is reopened via a new design change citing that trigger, not silently worked around
