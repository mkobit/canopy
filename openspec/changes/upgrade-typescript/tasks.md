## 1. Upgrades and compiler validation (canopy-w88.1)

- [x] ~~1.1 Update `typescript` version in `package.json` to `7.0.2` and run `bun install`.~~ Not done as written — see Amendments in design.md. `typescript` stays on 6.0.3; a separate `typescript-native` devDependency carries the 7.x compiler (fixed to stable `7.0.2` and wired reliably in canopy-1qb, after initially landing broken on an RC + flaky postinstall).
- [x] 1.2 Run compile and typecheck gates, resolving any compile-time errors. Re-verified against the actually-working native compiler in canopy-1qb (the original PR #380 validation was likely against plain 6.0.3, not TS 7, due to the postinstall bug).
- [x] ~~1.3 Update or verify `@typescript-eslint` packages compatibility to ensure clean parsing.~~ `@typescript-eslint` does not support TS 7 (peer range `<6.1.0`; see typescript-eslint#12518) and isn't expected to until TS 7.1 ships its new programmatic API. It keeps resolving plain `typescript@6.0.3` unaffected by the native compiler — that's the point of the dual-package split, not a compatibility update.

## 2. Test execution and CI validation (canopy-w88.2)

- [x] 2.1 Run all unit and integration tests under the new TypeScript toolchain. Re-verified in canopy-1qb (625 pass).
- [x] 2.2 Run `eslint` check to ensure zero linting errors. Re-verified in canopy-1qb (passes, running against plain 6.0.3 as intended).
