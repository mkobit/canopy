## Context

[canopy-kjg](../../../node_modules/@fontsource/inter/300.css) identified two primary blockers for replacing Vite with Bun's native bundler (`Bun.build`) in `apps/web`.
first, Bun's built-in CSS bundler automatically inlines all referenced font assets (`.woff` and `.woff2`) as Base64 data URLs in the bundled CSS file, bloating the bundle size from 107 KB to 2.3 MB.
second, Bun lacks native integration for compiling Tailwind CSS v4 on the fly, requiring a background Tailwind CLI compiler watch process.
this design documents the custom plugin architecture to resolve both blockers and provides a feasibility recommendation.

## Goals / Non-Goals

**Goals:**

- design a custom Bun bundler plugin that compiles PostCSS and Tailwind CSS v4 on the fly during `Bun.build`.
- prevent Base64 inlining of font assets by marking them as external in `Bun.build`'s resolution phase.
- copy physical font assets to the target output directory at the end of the build process.
- evaluate the success metrics and compare Vite vs. the custom `Bun.build` pipeline to decide if migration is recommended.

**Non-Goals:**

- executing the migration to replace Vite (the decision is to retain Vite and keep this spec as a design artifact for future consolidation).

## Decisions

### Decision 1: Mark woff/woff2 fonts as external in a custom Bun plugin

we resolve the font inlining issue by intercepting font resolutions in the `onResolve` hook and returning `{ external: true }`.

- **rationale**: this prevents Bun from inlining the fonts as Base64 data URLs, keeping the relative path intact and reducing the stylesheet size back to ~122 KB.
- **alternatives considered**: setting loader to `"file"` (leads to a Bun bundler error because onLoad plugins must return contents as a string/Uint8Array).

### Decision 2: Process CSS with PostCSS and Tailwind v4 inside onLoad

we resolve the Tailwind watch process requirement by compiling all `.css` files via PostCSS, `@tailwindcss/postcss`, and `autoprefixer` within the `onLoad` hook.

- **rationale**: this allows Tailwind compilation to occur in-process during bundling, eliminating the need to run an external Tailwind CLI watcher.
- **alternatives considered**: running the Tailwind CLI watcher in parallel (increases process orchestration complexity).

### Decision 3: Copy physical font files to output directory during onEnd

we copy all font files referenced during compilation from their respective `node_modules` folders to the output folder inside the `onEnd` build hook.

- **rationale**: because fonts are marked external, they are not moved to the output directory by Bun's default compiler. The custom plugin tracks absolute paths of resolved fonts in `onResolve` and copies them to the destination directory once bundling completes.
- **alternatives considered**: using external copy scripts (decouples build phases and increases chances of stale asset folders).

### Decision 4: Retain Vite as the primary bundler

we recommend keeping Vite as the active frontend bundler for Canopy at this time.

- **rationale**: although the custom Bun plugin resolves both blockers, it introduces significant build script complexity and custom file handling logic. Vite provides highly optimized HMR (React Fast Refresh), out-of-the-box asset handling, and superior development loop speed.
- **alternatives considered**: full migration to the custom `Bun.build` setup (increases maintenance footprint and introduces build fragility).

## Risks / Trade-offs

- [Risk] Custom file copying is prone to path resolution drift across environments.
  - [Mitigation] Keep Vite as the active toolchain and only use this custom plugin design if Bun natively addresses asset loaders.
- [Risk] Slower development builds due to PostCSS compilation inside `onLoad`.
  - [Mitigation] Vite leverages native compilation and caching; retaining Vite mitigates this risk.
