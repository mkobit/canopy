# AI tooling recurring audit process

This document defines the recurring audit process for keeping core AI developer tools (`@fission-ai/openspec` and `gastownhall/beads`) up to date across the codebase.

## Overview

Canopy relies on OpenSpec for spec-driven change management and Beads (`bd`) for issue and task tracking.
Because AI developer tooling evolves rapidly, a predictable recurring audit process ensures the project adopts upstream bug fixes, new features, and security updates while maintaining strict version synchronization across package definitions and shell environments.

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

When upgrading `@fission-ai/openspec` or `gastownhall/beads`, follow these steps:

1. Update the version string in `package.json` under `devDependencies` for `@fission-ai/openspec`
2. Update the version string in `mise.toml` under `[tools]` for `@fission-ai/openspec` and/or `github:gastownhall/beads`
3. Run `mise lock` to update `mise.lock` for the tool environment
4. Run `bun run check:versions` to verify version parity across `package.json` and `mise.toml`
5. Run the full quality verification suite (`bun run lint`, `bun run typecheck`, `bun test`)
6. Commit the version updates alongside `mise.lock` and `tools/verify-versions.ts` output verification

## Verification gates

Version consistency between `package.json` and `mise.toml` is enforced automatically in CI via `bun run check:versions` during `bun run lint`.
If `package.json` and `mise.toml` drift out of sync, `bun run lint` will fail with an explicit version mismatch error.
