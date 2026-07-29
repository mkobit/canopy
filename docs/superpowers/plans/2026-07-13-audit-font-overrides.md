# Audit font overrides implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename custom font family variables to standard Tailwind CSS theme variables to ensure complete typography consistency.

**Architecture:** We will configure the theme in the CSS stylesheet to map the Inter font family to the standard sans-serif font family.
We will update the application layout to use the standard utility class for the sans-serif font.
We will run automated tests and build checks to confirm correctness.

**Tech Stack:** React, Tailwind CSS, Vite, Bun

---

### Task 1: Theme configuration update

**Files:**
- Modify: `apps/web/src/index.css:3-7`

- [ ] **Step 1: Update the CSS theme configuration**

Modify [index.css](file:///home/mkobit/workspace/mkobit/canopy/.worktrees/canopy-f9t/apps/web/src/index.css#L3-L7) to replace `--font-body` with `--font-sans`.

```css
@theme {
  --font-sans: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-display: 'Space Grotesk', sans-serif;
```

- [ ] **Step 2: Commit the theme configuration changes**

Run:
```bash
git add apps/web/src/index.css
git commit -m "style: rename body font variable to standard sans-serif theme variable"
```
Expected: Commit succeeds.


### Task 2: Update layout class

**Files:**
- Modify: `apps/web/src/components/layout.tsx:55`

- [ ] **Step 1: Replace font-body class with font-sans**

Modify [layout.tsx](file:///home/mkobit/workspace/mkobit/canopy/.worktrees/canopy-f9t/apps/web/src/components/layout.tsx#L55) to use `font-sans` instead of `font-body`.

```tsx
    <div className="dark h-screen w-full bg-background text-on-surface font-sans overflow-hidden flex">
```

- [ ] **Step 2: Commit the layout class update**

Run:
```bash
git add apps/web/src/components/layout.tsx
git commit -m "style: replace font-body class with font-sans in layout"
```
Expected: Commit succeeds.


### Task 3: Quality gate verification

**Files:**
- Test: none

- [ ] **Step 1: Verify the build process**

Run: `bun run build`
Expected: Build finishes with 0 errors.

- [ ] **Step 2: Verify the linting rules**

Run: `bun run lint`
Expected: Lint finishes with 0 warnings or errors.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `bun run typecheck`
Expected: Type checking passes successfully.

- [ ] **Step 4: Verify the test suite**

Run: `bun test`
Expected: 341 tests pass.

- [ ] **Step 5: Commit any remaining changes**

Run:
```bash
git status
```
Expected: Working tree is clean.
