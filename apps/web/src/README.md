# Web application source

## Overview

These entry files bootstrap the Canopy web application by declaring Vite demo-seed environment types (`vite-env.d.ts`), wiring global fonts, styles, and React DOM mounting (`main.tsx`), and composing the context provider hierarchy and client-side routes (`app.tsx`).

## Interface

- `[app.tsx:App]` Default exported React component configuring providers and `BrowserRouter` routes.
- `[vite-env.d.ts:ImportMetaEnv]` Ambient interface declaring optional `readonly` `VITE_CANOPY_DEMO_SEED` and `CANOPY_DEMO_SEED` string flags.
- `[vite-env.d.ts:ImportMeta]` Ambient interface declaring `readonly env: ImportMetaEnv`.
- Subdirectories:
  - [components](./components/README.md) — `Layout` shell and all stateless UI components.
  - [context](./context/README.md) — `StorageProvider`, `GraphProvider`, and `PluginProvider`.
  - [pages](./pages/README.md) — Seven top-level React Router page components.
  - [plugin](./plugin/README.md) — WIT `draft-session-shim`, guest types, guest plugins, and Web Worker runtime.
  - [utils](./utils/README.md) — CSS, device ID, dialog, handler, and schema/node-type helpers.

## Invariants

- `[app.tsx:App]` Context providers nest in fixed order: `StorageProvider` > `GraphProvider` > `PluginProvider` > `BrowserRouter`.
- `[app.tsx:App]` Route tree nests `HomePage`, `SearchPage` (`/search`), and `GraphPage` (`/graph/:graphId`) under `Layout` (`/`), with `GraphPage` nesting `NodePage`, `ViewPage`, `SchemaPage`, `SchemaNamespacePage`, and index `SearchPage`.
- `[main.tsx:createRoot]` Assumes `#root` element exists in `document` and renders `App` inside `React.StrictMode`.
- `[vite-env.d.ts:ImportMetaEnv]` Environment properties on `ImportMetaEnv` and `ImportMeta.env` are `readonly`.

## Side Effects

- `[main.tsx:console.warn]` Emits `console.warn('Canopy demo seed mode active')` at module load if `VITE_CANOPY_DEMO_SEED === 'true'` or `CANOPY_DEMO_SEED === 'true'`.
- `[main.tsx:createRoot]` Mounts the React root into `document.querySelector('#root')` at module evaluation time and loads `@fontsource/*` and `./index.css` styles.

## Verification

- Run: `bun test`
