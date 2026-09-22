## Approval and execution boundary

Design and adversarial mitigations approved through [PR #545](https://github.com/mkobit/canopy/pull/545), merged at `f795656f566a856f5ac8a2f157879992464145c2`.
Earlier pending-approval wording in the design describes its pre-merge state.
The authoritative bounded handoffs are in `canopy-yxl.1` through `canopy-yxl.4` under `canopy-yxl`.
This artifact stages approved work; no implementation has been claimed or dispatched.
Before execution, Terra must renew the actual isolated environment, base revision, action authority and independent readiness review in those packets.
Retain `spec-driven`; do not regenerate instructions or archive this change.

## 1. Prepare execution

- [ ] 1.1 `canopy-yxl.1` — Terra verifies current contracts, provisions an isolated baseline, checks required browser guidance/tooling and records exact readiness evidence for Opus review.

## 2. Deliver the coupled runtime change

- [ ] 2.1 `canopy-yxl.2` — Luna implements [unavailable interactive rendering](specs/view-rendering/spec.md#scenario-unavailable-interactive-renderer-fails-closed) end to end, preserving the successful and ordinary-failure scenarios in the same requirement.
- [ ] 2.2 `canopy-yxl.2` — Demonstrate missing/empty guest ID, unknown guest, actual worker-load failure and raw-plus-interactive denial through production rendering and real browser Workers; preserve valid interactive and Markdown controls.

## 3. Verify independently

- [ ] 3.1 `canopy-yxl.3` — A fresh Luna verifier reproduces the real browser matrix against the exact passing implementation commit, checking absence of alternate execution/output and exclusion of the test fixture from production.
- [ ] 3.2 `canopy-yxl.4` — Opus verifies direction, scope and independent evidence; Terra supplies `mise run check`, browser and existing render-benchmark outcomes on the integrated revision before acceptance.

## Ownership and dependencies

Sequence: `canopy-yxl.1` → `canopy-yxl.2` → `canopy-yxl.3` → `canopy-yxl.4`.
Astra owns planning and unresolved architecture; Opus supervises direction and independent high-level verification; Terra orchestrates execution and integration; Luna implements the bounded end-to-end slice.
The coupled dispatch, worker-result and UI changes have one implementation writer.
Later verification is read-only; repairs return to Terra and invalidate affected evidence.
agy/Gemini routing remains to be assigned explicitly and does not alter these responsibilities or authority gates.
View-dependent fallback research remains `canopy-z92`; cache-context semantics, other design queues and the deferred capability/API work are outside these tasks.
`canopy-7rv` remains a separate approved extraction; its packets must be renewed if renderer implementation lands first.
