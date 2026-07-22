## Why

Currently, Canopy uses two different build systems: Bun for package management, script execution, running tests, and compiling packages, and Vite for building and serving the front-end React single-page application (`apps/web`).
Consolidating our build toolchain by replacing Vite with Bun's native bundler reduces dependencies, simplifies configurations, aligns local development closely with test execution environments, and removes redundant build tools.

## What Changes

- **Toolchain Consolidation**: Replace Vite with Bun's native bundler (`Bun.build` or CLI equivalent) in `apps/web` for dev, preview, and production builds.
- **Dependency Removal**: Remove `vite` and `@vitejs/plugin-react` from `package.json` and devDependencies.
- **Build Configurations**: Replace `vite.config.ts` with a native Bun build script or configuration.
- **CSS and Asset Processing**: Configure Bun's native bundler or `@tailwindcss/cli` to build CSS files and handle font/image asset resolution.
- **Dev Server**: Implement a lightweight development server under Bun (e.g. using `Bun.serve`) that supports Hot Module Replacement (HMR) or fast reloading for client-side routing.

## Capabilities

### New Capabilities

- `web-app-bundling`: Bundle and serve the client-side React single-page application and its assets natively using Bun.

### Modified Capabilities

<!-- None -->

## Impact

- `apps/web`: Removes `vite` dependency, `vite.config.ts`, and replaces them with a Bun-based bundler and dev server configuration.
- `package.json` (root and `apps/web`): Removes `vite` and `@vitejs/plugin-react`.
- Development/CI workflows: Updates `bun run build` and `bun run dev` commands.
