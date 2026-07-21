## Context

Canopy currently utilizes Vite for building and serving the React frontend (`apps/web`), while Bun is used for packaging, running scripts, and executing tests. Consolidating the toolchain to use Bun's native bundler (`Bun.build`) and dev server would simplify the stack by removing Vite.
This document details our findings from a technical feasibility analysis and proof-of-concept (PoC) investigation of replacing Vite with Bun's native bundler.

## Goals / Non-Goals

**Goals:**

- Evaluate the feasibility of compiling, bundling, and serving `apps/web` using Bun's native bundler and CLI dev server.
- Benchmark build output size, compilation speed, and developer experience (HMR, CSS compilation, asset resolution).
- Identify compatibility blockers and performance regressions.

**Non-Goals:**

- Moving other workspaces or scripts away from Bun.
- Upgrading to a third-party framework (like Next.js) or altering the React SPA architecture.

## Decisions

### Decision: Retain Vite for apps/web and Defer Consolidating to Bun's Native Bundler

Based on our proof-of-concept, we recommend **retaining Vite** and deferring the consolidation to Bun's native bundler for the following reasons:

1. **Asset Inlining Bug / Severe CSS Bloat**:
   - Bun's CSS bundler automatically inlines all referenced font assets (`.woff` and `.woff2` from `@fontsource/*` packages) as Base64 data URLs in the bundled CSS file.
   - There is currently no stable configuration or loader override (like `loader: { ".woff2": "file" }`) that prevents this auto-inlining inside CSS imports.
   - This inlining balloons the production CSS bundle from **107 KB** under Vite to **2.3 MB** under Bun.
   - Since CSS is a render-blocking asset, downloading and parsing a 2.3 MB CSS file on initial page load causes a severe performance regression (violating Largest Contentful Paint (LCP)).
   - Resolving this would require complex post-processing scripts or marking the fonts as external and manually copying them, defeating the simplicity of a consolidated toolchain.

2. **Tailwind CSS v4 Integration Complexity**:
   - Tailwind CSS v4 relies on a compiler pass to discover classes from source code and generate the final stylesheet.
   - Vite integrates Tailwind natively via the `@tailwindcss/postcss` plugin, compiling styles on-the-fly inside a single unified dev server.
   - Bun has no native Tailwind compiler plugin. To run the Bun dev server (`bun ./index.html`), we must run a separate concurrent background process (`bunx @tailwindcss/cli -i ./src/index.css -o ./src/tailwind-built.css --watch`) and reference the output file in our source. This introduces additional orchestration complexity for local development.

### Alternatives Considered

- **Alternative 1: Post-processing CSS bundle / custom plugin**:
  - We could write a custom Bun plugin or post-build script to rewrite CSS `url(...)` declarations, copy font files from `node_modules` to `dist/`, and prevent the Base64 inlining.
  - _Why rejected_: This introduces fragile file-parsing regexes and ad-hoc build scripts that increase maintenance overhead, contradicting the goal of simplifying the build system.
- **Alternative 2: CDN-hosted fonts**:
  - Replace `@fontsource/*` npm packages with CDN links (e.g. Google Fonts) so Bun's bundler doesn't process them.
  - _Why rejected_: Violates local-first / offline-first capabilities of Canopy. The application must remain fully functional without internet access.

## Risks / Trade-offs

- **[Risk] Developer Toolchain Duplication** → Maintaining Vite in the workspace alongside Bun adds another tool config (`vite.config.ts`), but this is mitigated by the fact that Vite is extremely mature, highly optimized for React Fast Refresh, and natively supports Tailwind CSS v4 compiling.
- **[Risk] Future Upgrades** → We will monitor Bun's progress on respecting file loaders for CSS assets (e.g., Issue #28307, Issue #28923). Once Bun supports asset copying inside CSS files without Base64 inlining, we can re-evaluate the consolidation.
