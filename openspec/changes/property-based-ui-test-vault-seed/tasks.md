# Tasks: Property-Based Vault Seed Generator & Unified UI Test Harness

- [ ] 1. Implement modular generator building blocks (`apps/web/src/test/generators/`)
  - [ ] 1.1 Create `node-generators.ts`, `schema-generators.ts`, `query-generators.ts`, and `graph-generators.ts`
  - [ ] 1.2 Implement property-based seed generation adhering to thin, convention-driven initial schemas
  - [ ] 1.3 Add unit tests in `apps/web/src/test/generators/__tests__/generators.test.ts`
- [ ] 2. Implement unified seed vault API helper (`apps/web/src/test/seed-vault.ts`)
  - [ ] 2.1 Expose `seedVaultStore(store, options)` to populate event log stores with deterministic or randomized presets
  - [ ] 2.2 Add unit tests in `apps/web/src/test/seed-vault.test.ts`
- [ ] 3. Implement automated Playwright E2E user journey spec (`apps/web/e2e/user-journeys.e2e.ts`)
  - [ ] 3.1 Configure Playwright setup to seed demo graph vault using `generateVault`
  - [ ] 3.2 Assert end-to-end user workflows (command palette navigation, block editing, query execution, schema creation)
- [ ] 4. Add interactive dev demo seed command (`apps/web/package.json`)
  - [ ] 4.1 Add `dev:demo` script (`CANOPY_DEMO_SEED=true vite`) to `apps/web/package.json`
  - [ ] 4.2 Hook auto-seeding into web app boot routine when storage is uninitialized and `CANOPY_DEMO_SEED=true`
