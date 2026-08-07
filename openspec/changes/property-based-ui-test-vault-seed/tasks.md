# Tasks: Property-Based Vault Seed Generator & Unified UI Test Harness

- [x] 1. Implement modular generator building blocks (`apps/web/src/test/generators/`)
  - [x] 1.1 Create `node-generators.ts`, `schema-generators.ts`, `query-generators.ts`, and `graph-generators.ts`
  - [x] 1.2 Implement property-based seed generation adhering to thin, convention-driven initial schemas
  - [x] 1.3 Add unit tests in `apps/web/src/test/generators/__tests__/generators.test.ts`
- [x] 2. Implement unified seed vault API helper (`apps/web/src/test/seed-vault.ts`)
  - [x] 2.1 Expose `seedVaultStore(store, options)` to populate event log stores with deterministic or randomized presets
  - [x] 2.2 Add unit tests in `apps/web/src/test/seed-vault.test.ts`
- [x] 3. Implement automated Playwright E2E user journey spec (`apps/web/e2e/user-journeys.e2e.ts`)
  - [x] 3.1 Configure Playwright setup to seed demo graph vault using `generateVault`
  - [x] 3.2 Assert end-to-end user workflows (command palette navigation, block editing, query execution, schema creation)
- [x] 4. Add interactive dev demo seed command (`apps/web/package.json`)
  - [x] 4.1 Add `dev:demo` script (`CANOPY_DEMO_SEED=true vite`) to `apps/web/package.json`
  - [x] 4.2 Hook auto-seeding into web app boot routine when storage is uninitialized and `CANOPY_DEMO_SEED=true`
