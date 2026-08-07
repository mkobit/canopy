# Design: Storybook setup in `apps/web`

## Context

Bead `canopy-gtv.1`.
This document details the design for setting up Storybook in `apps/web` for visual component testing.
It configures Storybook using `@storybook/react-vite` to leverage the existing Vite 8 build setup in `apps/web` while executing scripts via Bun.

## Goals & non-goals

### Goals

- Configure Storybook 8 in `apps/web` using `@storybook/react-vite` and `@storybook/addon-essentials`.
- Import Tailwind CSS v4 styles and Google Fonts in `.storybook/preview.tsx` to match app styling.
- Co-locate `*.stories.tsx` files alongside UI components in `apps/web/src/components/graph/`.
- Provide working stories for core Graph canvas and node components (`custom-node`, `custom-edge`, `graph-canvas`).
- Add `"storybook"` and `"build-storybook"` scripts to `apps/web/package.json` and a root convenience script.

### Non-goals

- Replacing Vite with Bun's native bundler across `apps/web` (tracked separately in `canopy-kjg`).
- Setting up visual regression snapshot testing pipelines in CI in this initial bead.

## Decisions

### Decision 1: Use `@storybook/react-vite` scoped to `apps/web`

We choose to use `@storybook/react-vite` inside `apps/web` rather than a root or standalone package setup.
`apps/web` already uses Vite 8 (`vite.config.ts`) and React 19 (`react` 19.2.7).
Using `@storybook/react-vite` allows Storybook to inherit `apps/web`'s existing Vite aliases (such as `canopy:graph/draft-session`) and bundler plugins without duplicated configuration.

### Decision 2: Co-locate stories next to components

We co-locate story files (`custom-node.stories.tsx`, `custom-edge.stories.tsx`, `graph-canvas.stories.tsx`) inside `apps/web/src/components/graph/`.
This keeps component logic and visual documentation together and simplifies file discovery.

### Decision 3: React Flow context wrapper for graph components

Components like `CustomNode`, `CustomEdge`, and `GraphCanvas` require `@xyflow/react` context provider wrappers (`ReactFlowProvider`).
We provide mock state and a shared `withReactFlow` decorator in `.storybook/preview.tsx` to wrap graph components safely.

## Technical implementation details

### Storybook configuration (`apps/web/.storybook/`)

- `main.ts`:
  - Framework: `@storybook/react-vite`
  - Stories glob: `../src/**/*.stories.@(js|jsx|mjs|ts|tsx)`
  - Addons: `@storybook/addon-essentials`
- `preview.tsx`:
  - Imports `../src/index.css` for Tailwind CSS v4 styles.
  - Imports `@fontsource/inter`, `@fontsource/jetbrains-mono`, and `@fontsource/space-grotesk`.
  - Imports `@xyflow/react/dist/style.css` for React Flow canvas styling.

### Initial stories (`apps/web/src/components/graph/`)

- `custom-node.stories.tsx`: renders `CustomNode` in default, selected, and custom label states within a mock React Flow canvas.
- `custom-edge.stories.tsx`: renders `CustomEdge` in default, selected, and directional arrow states.
- `graph-canvas.stories.tsx`: renders `GraphCanvas` with sample nodes and edges.

## Adversarial review and mitigations

### 1. Resource and performance overhead

- **Risk**: Adding Storybook 8 dependencies introduces 100+ transitive packages to `apps/web`, increasing `bun install` duration, lockfile size, and telemetry background requests.
- **Mitigation**:
  - Keep Storybook dependencies restricted strictly to `devDependencies` in `apps/web/package.json`.
  - Set `STORYBOOK_DISABLE_TELEMETRY=1` in package scripts and CI environments.
  - Add `.storybook-static/` to `.gitignore` and `eslint.config.mjs` ignores list to prevent build artifact pollution.

### 2. Failure modes and edge cases

- **Risk 1**: Components depending on `@xyflow/react` hooks (`useReactFlow`, `useNodes`) fail at runtime when rendered inside Storybook without a `<ReactFlowProvider>`.
- **Mitigation**: Implement a shared `withReactFlow` decorator in `.storybook/preview.tsx` and story definitions to supply `ReactFlowProvider` context and default canvas nodes/edges.
- **Risk 2**: Tailwind CSS v4 (`@tailwindcss/postcss`) styles fail to compile in Storybook if Vite PostCSS processing is not inherited.
- **Mitigation**: Import `src/index.css` in `.storybook/preview.tsx` and verify `.storybook/main.ts` delegates bundling to Vite's root PostCSS configuration.
- **Risk 3**: Storybook Vite builder fails when loading transpiled WASM plugins or shims (e.g. `canopy:graph/draft-session`).
- **Mitigation**: Re-use `apps/web/vite.config.ts` path aliases in `.storybook/main.ts` `viteFinal` hook and point WASM imports to pure JavaScript shims (`guest.js`).

### 3. Security and isolation

- **Risk**: `storybook dev` default server settings may listen on external network interfaces (`0.0.0.0`), exposing internal component previews to local network peers.
- **Mitigation**: Configure `storybook dev` flags to bind explicitly to `127.0.0.1` / `localhost`.

### 4. Migration and backward compatibility risks

- **Risk**: Planned build tool migration from Vite to Bun's native bundler (`canopy-kjg`) creates tech debt if stories rely on Vite-specific features.
- **Mitigation**: Enforce standard Component Story Format (CSF 3) for all story files without Vite-specific APIs. Keep `.storybook/main.ts` minimal so replacing `@storybook/react-vite` in the future requires modifying only the builder config.
