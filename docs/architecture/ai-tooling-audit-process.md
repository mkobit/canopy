# AI tooling recurring audit process

This document defines the recurring audit process for keeping core AI developer tools (`@fission-ai/openspec` and `gastownhall/beads`) up to date across the codebase.

## Overview

Canopy relies on OpenSpec for spec-driven change management and Beads (`bd`) for issue and task tracking.
Because AI developer tooling evolves rapidly, a predictable recurring audit process ensures the project adopts upstream bug fixes, new features, and security updates.

OpenSpec is a Bun `devDependency` only (invoked via `bunx openspec`); it is intentionally not mise-managed, so there is no `mise.toml` entry to keep in sync for it.
Beads is mise-managed and does need version synchronization between `mise.toml` and `mise.lock`.

## Audit frequency and triggers

Run the AI tooling audit:

- At the start of every sprint or major epic planning phase
- Prior to initiating a new OpenSpec change proposal (`/opsx:propose`)
- Weekly during active development cycles

## Automated release audit

Execute the release audit script to compare local tool configurations against upstream registries:

```bash
bun run audit:ai-tools
```

The script queries the NPM registry for `@fission-ai/openspec` and GitHub releases for `gastownhall/beads`.
If a newer release exists, the script highlights the version difference and outputs the next steps.

## Upgrade procedure

When upgrading `@fission-ai/openspec`:

1. Update the version string in `package.json` under `devDependencies` for `@fission-ai/openspec`
2. Run the full quality verification suite (`bun run lint`, `bun run typecheck`, `bun test`)
3. Commit the version update

When upgrading `gastownhall/beads`:

1. Update the version string in `mise.toml` under `[tools]` for `github:gastownhall/beads`
2. Run `mise lock` to update `mise.lock` for the tool environment
3. Run `bun run check:versions` to verify the Bun/Beads version parity between `package.json` and `mise.toml`
4. Run the full quality verification suite (`bun run lint`, `bun run typecheck`, `bun test`)
5. Commit the version updates alongside `mise.lock`

## Verification gates

Bun and Beads version consistency between `package.json` and `mise.toml` is enforced automatically in CI via `bun run check:versions` during `bun run lint`.
If they drift out of sync, `bun run lint` will fail with an explicit version mismatch error.
OpenSpec is exempt from this check since it has no `mise.toml` entry.
