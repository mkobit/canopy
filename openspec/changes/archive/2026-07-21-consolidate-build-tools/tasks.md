## 1. Document Research

- [ ] 1.1 Create research document `docs/research/2026-07-21-bun-native-bundler-investigation.md` outlining the investigation details, PoC results, and reasons for deferring the consolidation.

## 2. Clean Up Temporary Files

- [ ] 2.2 Delete the temporary test script `apps/web/scripts/test-bun-build.ts`.
- [ ] 2.3 Delete the temporary compiled CSS file `apps/web/src/tailwind-built.css`.
- [ ] 2.4 Delete the temporary build output directory `apps/web/dist-bun/`.

## 3. Verify Codebase Integrity

- [ ] 3.1 Run `bun run lint` to verify that lint rules pass.
- [ ] 3.2 Run `bun run typecheck` to verify that TypeScript type checking passes.
- [ ] 3.3 Run `bun test` to confirm all 435 tests pass.
