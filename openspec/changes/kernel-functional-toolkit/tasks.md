## 1. Ratify the decision in docs

- [ ] 1.1 Update `docs/research/2026-08-15-eliminating-eslint-disables-playbook.md`: change the Hard Constraints "Blocked on the toolkit decision … assumes plain-functional default and must be adjusted if Effect is chosen" to state plain-functional is the ratified, unconditional default for kernel-tier packages, and that kernel beads are now unblocked.
- [ ] 1.2 In the same playbook, adjust the `functional/no-return-void` recipe to drop the "evaluate an Effect Stream (if Effect adopted)" hedge for kernel-tier code, and point recurring-helper cases at `@canopy/graph`-homed helpers (D2).
- [ ] 1.3 Add a dated ADR entry to `docs/architecture/decisions.md` recording D1 (Effect-free kernel), D2 (no bucket package; leaf-homed helpers), D3 (no `@canopy/graph` split motivated), and the D5 revisit triggers, cross-referencing `canopy-v9o.1.1`.

## 2. Verify no code drift

- [ ] 2.1 Confirm `effect` is absent from `dependencies`/`devDependencies` of `@canopy/graph`, `@canopy/queries`, `@canopy/settings`, and every `@canopy/storage*` `package.json`, and that none import `from 'effect'` (baseline the decision protects — no change expected).

## 3. Land and unblock

- [ ] 3.1 Open the change PR, ensure the design's adversarial-review section is reviewed, and merge to `main` (the approval signal that gates the rewrite beads).
- [ ] 3.2 Close `canopy-v9o.1.1`; verify the 22 rewrite beads (`canopy-v9o.1.5`–`.26`) unblock via their dependency on it.
- [ ] 3.3 Archive the OpenSpec change with `/opsx:archive` and sync specs.
