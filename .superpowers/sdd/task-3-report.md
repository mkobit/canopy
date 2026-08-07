# Task 3 report: automated Playwright E2E user journeys

## Summary

Created automated Playwright user journey E2E test suite in `apps/web/e2e/user-journeys.e2e.ts`.
Configured Playwright dev webServer environment variable `VITE_CANOPY_DEMO_SEED=true` to automatically seed demo graph vault during test execution.
Added accessibility attributes `role="dialog"` and `aria-modal="true"` to `CommandPalette` component.
Resolved initial storage provider race condition to ensure state update occurs after vault seeding completes.

## Changes made

- `apps/web/playwright.config.ts`: Added `VITE_CANOPY_DEMO_SEED: 'true'` to `webServer.env`.
- `apps/web/src/components/layout/command-palette.tsx`: Added `role="dialog"` and `aria-modal="true"` to modal overlay container.
- `apps/web/src/context/storage-context.tsx`: Updated initialization order so storage state (`eventLog`, `registry`) updates after demo vault seeding completes.
- `apps/web/e2e/user-journeys.e2e.ts`: Added E2E specs testing seeded demo graph homepage visibility, command palette shortcut invocation (`Control+p`), and side navigation across sections.

## Verification results

- Playwright E2E tests: 2 passed in 3.5s (`bun run --filter @canopy/web test:e2e -- e2e/user-journeys.e2e.ts`).
- Unit tests: 653 tests passed across 93 files (`bun test`).
- Type check: Passed with zero errors (`bun run typecheck`).
- Lint check: Passed with zero warnings/errors (`bun run lint`).
- Build: All 9 packages built successfully (`bun run build`).

## Commit details

- Commit SHA: `7614d4e3a2e57a8523f35956d58882cbf22fb909`
- Commit Message: `test(web): add automated Playwright user journey E2E spec`
