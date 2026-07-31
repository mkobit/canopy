# Knip monorepo analysis design

## Purpose and goals

This document designs the Knip static analysis setup for the Canopy monorepo.
It defines entry points, dependency analysis rules, package scripts, and CI integration to detect unused files, exports, and dependencies across all packages and applications.

## Package configuration and scripts

Add `knip` as a development dependency in the root `package.json`.
Define a tool-agnostic package script `"check:unused": "knip"` in root `package.json`.
Update the root `"lint"` script in `package.json` to include `bun run check:unused` alongside existing quality checks.

```json
{
  "scripts": {
    "check:unused": "knip",
    "lint": "bun tools/check-commands.ts && bun run check:versions && bun run check:api-compatibility && bun run check:unused && eslint . --cache"
  }
}
```

Add optional task aliases in `mise.toml` under `[tasks]` for local developer convenience:

```toml
[tasks.check-unused]
run = "bun run check:unused"
description = "Check for unused files, exports, and dependencies with Knip"
```

## Knip workspace configuration

Create a root `knip.json` file configuring the workspace packages, entrypoints, and ignore rules.

```json
{
  "$schema": "https://unpkg.com/knip@5/schemas/jsonconfig.json",
  "workspaces": {
    ".": {
      "entry": ["tools/*.ts"],
      "project": ["tools/**/*.ts"]
    },
    "packages/*": {
      "entry": ["src/index.ts!"],
      "project": ["src/**/*.ts"]
    },
    "apps/web": {
      "entry": [
        "src/main.tsx!",
        "index.html",
        "vite.config.ts",
        ".storybook/main.ts",
        ".storybook/preview.ts",
        "src/**/*.stories.tsx"
      ],
      "project": ["src/**/*.{ts,tsx}"]
    },
    "apps/cli": {
      "entry": ["src/index.ts!"],
      "project": ["src/**/*.ts"]
    }
  },
  "ignore": [
    "**/transpiled/**/*",
    "**/dist/**/*"
  ]
}
```

## Local developer workflow and CI integration

Developers can run `bun run check:unused` or `bun run lint` locally.
In `.github/workflows/ci.yml`, the existing `bun run lint` step will automatically run `bun run check:unused`.
Mise will continue to handle tool provisioning and version alignment for Bun in CI without taking over job orchestration.

## Adversarial review and mitigations

### Resource and performance overhead
Running Knip AST analysis across 11 packages and tools scripts could increase linting time.
*Mitigation*: Knip uses cached TypeScript programs and executes in under 2 seconds. We will benchmark `bun run lint` to verify that linting time remains fast.

### False positives on entrypoints and exports
Library packages in `@canopy/*` export public interfaces that may not yet be consumed by `apps/*`.
*Mitigation*: Mark public package entry points with `!` in `knip.json` to signal exported symbols as intentional entry points, and configure workspace package dependencies accurately.

### Supply chain and dependency risks
Installing new development dependencies could introduce unstable versions.
*Mitigation*: Pin an established version of `knip` in `package.json` adhering to minimum package release age guidelines.

### Legacy dead code cleanup
First-time execution of Knip may discover unreferenced exports or unused dependencies currently in the tree.
*Mitigation*: Perform a cleanup pass during implementation to resolve legitimate dead code, and explicitly annotate valid exceptions in `knip.json`.
