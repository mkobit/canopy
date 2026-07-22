# Research Report: Consolidating Build Tools to Bun's Native Bundler

This document summarizes the technical investigation into consolidating Canopy's frontend build toolchain by replacing Vite with Bun's native bundler (`Bun.build`).

## Executive Summary

We investigated replacing Vite with Bun's native bundler in `apps/web` for building and serving the React application.
While Bun's bundler and dev server successfully compile and serve the application, two severe regressions make the replacement unfeasible at this time.
First, Bun's CSS bundling pipeline (utilizing LightningCSS) automatically inlines all referenced font assets (`.woff` and `.woff2` files from `@fontsource/*` packages) as Base64 data URLs in the CSS output.
This increases the CSS bundle size from **107 KB** under Vite to **2.3 MB** under Bun.
Since CSS is render-blocking, a 2.3 MB stylesheet introduces a critical performance regression for Largest Contentful Paint (LCP).
Second, Bun lacks a native watcher or plugin for compiling Tailwind CSS v4 on the fly.
Developers would have to run the Tailwind CLI in a separate background watch process during development, which is less unified than Vite's single-process setup.
Therefore, we recommend retaining Vite for the frontend build toolchain and deferring consolidation until Bun supports asset copying inside CSS files without Base64 inlining.

## Technical Feasibility & PoC Benchmarks

We ran a proof-of-concept build using Bun's native bundler on `src/main.tsx`.

### JS/TSX Compilation

- **Status**: Passed.
- **Details**: Bun successfully bundles the React components and transpiles JSX/TSX.
- **Output**: `dist-bun/main.js` and `dist-bun/main.js.map`.

### Development Server & HMR

- **Status**: Partial.
- **Command**: `bun index.html`.
- **Details**: Starts a zero-config server at `http://localhost:3000/`.
- **Limitation**: Requires running `bunx @tailwindcss/cli -i ./src/index.css -o ./src/tailwind-built.css --watch` concurrently to recompile styles on change.

### CSS and Asset Resolution

- **Status**: Failed (Severe Regression).
- **Details**: `@fontsource` font packages are referenced via `url()` imports in the CSS.
- **Behavior**: Bun's bundler automatically encodes all font subsets (latin, cyrillic, greek, etc.) as Base64 strings directly in the CSS.
- **Vite CSS Bundle**: **107 KB** (separate font files in `dist/assets/`).
- **Bun CSS Bundle**: **2.3 MB** (all font files inlined as Base64).
- **Impact**: Highly detrimental to initial page load times and browser caching.

## Recommendations

We recommend deferring this task and keeping Vite as the active bundler for `apps/web`.
We will monitor Bun's progress on upstream issues (e.g., Issue #28307, Issue #28923) regarding asset loaders for CSS files.
Once Bun supports asset copying and path rewriting for fonts instead of mandatory Base64 inlining, we can re-evaluate the consolidation.
