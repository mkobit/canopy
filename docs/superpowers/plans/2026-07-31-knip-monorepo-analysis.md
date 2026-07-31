# Knip monorepo analysis implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure root Knip static analysis for workspace packages and tools, add `check:unused` script, clean up unused code, and integrate into quality gates.

**Architecture:** Add `knip` dependency to root `package.json`, configure `knip.json` for monorepo workspaces and entry points, add `"check:unused": "knip"` script in `package.json`, update `"lint"` script sequence, and verify with existing project test and build quality gates.

**Tech Stack:** Bun, Knip, TypeScript, ESLint, GitHub Actions CI.

## Global constraints

- Enforce exact non-wildcard script entries and strict TypeScript.
- No `any` or `Record<string, unknown>`.
- One sentence per line in documentation and prose.
- Sentence case for headings, commits, PR titles, UI labels.
- Verify all quality gates (`bun run build`, `bun run lint`, `bun run typecheck`, `bun test`) before completing each task.

---

### Task 1: Install Knip and configure root `knip.json`

**Files:**
- Modify: [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json)
- Create: [knip.json](file:///home/mkobit/workspace/mkobit/canopy/knip.json)
- Modify: [mise.toml](file:///home/mkobit/workspace/mkobit/canopy/mise.toml)

**Interfaces:**
- Consumes: Monorepo workspace layout (`packages/*`, `apps/*`, `tools`).
- Produces: `"check:unused"` script in `package.json` and `knip.json` workspace configuration.

- [ ] **Step 1: Add `knip` to root `devDependencies` and script to `package.json`**

Edit `package.json` to include `"knip": "^5.45.0"` under `devDependencies` and `"check:unused": "knip"` under `scripts`.

```json
  "scripts": {
    "check:unused": "knip",
    ...
  }
```

- [ ] **Step 2: Install dependencies**

Run: `bun install`
Expected: `knip` installed successfully without lockfile resolution errors.

- [ ] **Step 3: Create root `knip.json` configuration file**

Create `knip.json` at repository root:

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

- [ ] **Step 4: Update `mise.toml` to add local task alias**

Add `[tasks.check-unused]` to `mise.toml`:

```toml
[tasks.check-unused]
run = "bun run check:unused"
description = "Check for unused files, exports, and dependencies with Knip"
```

- [ ] **Step 5: Verify Knip command execution**

Run: `bun run check:unused`
Expected: Knip executes analysis across workspaces.

- [ ] **Step 6: Commit Task 1 changes**

```bash
git add package.json bun.lock knip.json mise.toml
git commit -m "build: install knip and configure workspace knip.json"
```

---

### Task 2: Resolve Knip warnings and dead code findings

**Files:**
- Modify: [knip.json](file:///home/mkobit/workspace/mkobit/canopy/knip.json) and affected source/package files as identified.

**Interfaces:**
- Consumes: Knip report from `bun run check:unused`.
- Produces: Clean zero-warning Knip output.

- [ ] **Step 1: Run Knip analysis and review output**

Run: `bun run check:unused`
Expected: Identify unused files, dependencies, or unexported symbols.

- [ ] **Step 2: Remediate findings**

For unused dependencies or dead code: remove unused dependencies or code.
For legitimate public exports or plugin entry points: refine `knip.json` entrypoints or ignore configuration.

- [ ] **Step 3: Verify clean Knip run**

Run: `bun run check:unused`
Expected: Exit code 0 with zero unused dependencies or files reported.

- [ ] **Step 4: Verify full project quality gates**

Run: `bun run build && bun run lint && bun run typecheck && bun test`
Expected: All 4 quality gates pass cleanly.

- [ ] **Step 5: Commit Task 2 remediation**

```bash
git add -u
git commit -m "refactor: resolve unused exports and dependencies reported by knip"
```

---

### Task 3: Integrate `check:unused` into root `lint` quality gate

**Files:**
- Modify: [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json)

**Interfaces:**
- Consumes: `"check:unused"` script from Task 1.
- Produces: Updated `"lint"` script in `package.json`.

- [ ] **Step 1: Update `"lint"` script in `package.json`**

Update `"lint"` script in `package.json` to:
`"bun tools/check-commands.ts && bun run check:versions && bun run check:api-compatibility && bun run check:unused && eslint . --cache"`

- [ ] **Step 2: Run full quality gates**

Run: `bun run build && bun run lint && bun run typecheck && bun test`
Expected: All commands pass cleanly, including `bun run lint` running `check:unused`.

- [ ] **Step 3: Commit Task 3 changes**

```bash
git add package.json
git commit -m "ci: add check:unused to root lint script"
```
