## Approval and execution boundary

The [design proposal and adversarial mitigations](design.md) were approved through [PR #593](https://github.com/mkobit/canopy/pull/593) at commit `6b968c9ae78d12cbf11b754f0fd6b9a05a7a96fe`.
The requirements specification is defined in [spec.md](specs/plugin-and-extension-boundaries/spec.md).
Authoritative implementation task records are staged under parent epic `canopy-ax6` as `canopy-ax6.1` through `canopy-ax6.5`.
Tasks remain staged and unclaimed.
Implementation execution requires explicit claim (`bd update <id> --claim`) in a dedicated session.

## 1. Durable schema retention and type lifecycle in @canopy/graph — canopy-ax6.1

- [x] 1.1 Add `status?: 'active' | 'inactive'` to `NodeTypeDefinition` and `EdgeTypeDefinition` in `packages/graph/src/definitions.ts`.
- [x] 1.2 Update `NodeTypeDefinitionSchema` and `EdgeTypeDefinitionSchema` in `packages/graph/src/schemas.ts` to validate the optional `status` property.
- [x] 1.3 Update type extraction helpers in `packages/graph/src/validation.ts` to extract `status`, defaulting to `'active'` when omitted.
- [x] 1.4 Add `TYPE_INACTIVE` validation failure to `validateNode` in `packages/graph/src/validation.ts` when a client creates a node of an inactive type.
- [x] 1.5 Update node mutation operations in `packages/graph/src/ops/node.ts` to reject node creation for inactive types while permitting node deletion.
- [x] 1.6 Add test coverage in `packages/graph/tests/validation.test.ts` verifying `TYPE_INACTIVE` validation, query retrieval for inactive types, and historical event log replay.

## 2. Explicit capability grants and token binding in @canopy/plugin-host and @canopy/graph-access — canopy-ax6.2

- [x] 2.1 Define the sensitive capability set in `packages/plugin-host/src/wasm/capabilities.ts` containing `render:interactive`, `network:connect`, and write operations (`write:create-node`, `write:update-properties`, `write:delete-node`, `write:create-edge`, `write:delete-edge`).
- [x] 2.2 Update `defaultCapabilityValidator` in `packages/plugin-host/src/wasm/capabilities.ts` to reject wildcard tokens (`*`, `write:*`, `render:*`) for all sensitive capabilities.
- [x] 2.3 Require `boundToken` and reject caller-supplied token overrides across the guest ABI in `packages/plugin-host/src/wasm/host-bindings.ts`.
- [x] 2.4 Fail closed with `PERMISSION_DENIED` in `packages/plugin-host/src/wasm/host-bindings.ts` when host bindings execute without a verified bound token.
- [x] 2.5 Add capability verification tests in `packages/plugin-host/tests/wasm-capabilities.test.ts` for wildcard rejection and literal match enforcement.
- [x] 2.6 Add security tests in `packages/plugin-host/tests/wasm-host-bindings.test.ts` verifying token forgery rejection across the guest ABI.

## 3. Guest worker isolation hardening in @canopy/plugin-host — canopy-ax6.3

- [x] 3.1 Update `hardenGuestWorkerScope` in `packages/plugin-host/src/wasm/terminable-execution.ts` to delete `Worker`, `SharedWorker`, `fetch`, `WebSocket`, `XMLHttpRequest`, and `indexedDB` from the global scope.
- [x] 3.2 Freeze the worker global prototype chain in `hardenGuestWorkerScope` to prevent prototype pollution.
- [x] 3.3 Verify calling `new Worker()` inside a hardened worker isolate throws a `TypeError`.
- [x] 3.4 Enforce the 2000 ms wall-clock deadline in `executeTerminableGuest` and terminate non-responsive worker isolates with a `RESOURCE_EXHAUSTED` error.
- [x] 3.5 Add unit tests in `packages/plugin-host/tests/wasm-terminable-execution.test.ts` for ambient global removal, prototype immutability, and deadline termination.

## 4. View resolution fallback cascade in UI — canopy-ax6.4

- [x] 4.1 Implement the generic property table inspector fallback component in `apps/web/src/components/renderers/`.
- [x] 4.2 Update `resolveRenderer` in `apps/web/src/components/renderers/block-renderer.tsx` to cascade to the generic property table inspector when a custom renderer is unavailable, uninstalled, or inactive.
- [x] 4.3 Preserve host-owned unavailable state for missing or unresolvable Tier 2 interactive renderers in `apps/web/src/components/renderers/block-renderer.tsx` without downgrading to inline render.
- [x] 4.4 Implement a structured error boundary banner in `apps/web/src/components/renderers/` for guest execution errors, panics, and deadline terminations.
- [x] 4.5 Add an affordance to the error boundary banner to inspect raw node properties using the generic property table inspector.
- [x] 4.6 Add tests in `apps/web/src/components/renderers/--tests--/block-renderer.test.tsx` verifying fallback cascade, fail-closed interactive state, and error banner display.

## 5. Verification and quality gates — canopy-ax6.5

- [ ] 5.1 Run test suites across `@canopy/graph`, `@canopy/plugin-host`, `@canopy/graph-access`, and `apps/web`.
- [ ] 5.2 Run the full project build gate with `bun run build`.
- [ ] 5.3 Run the linter gate with `bun run lint`.
- [ ] 5.4 Run the typecheck gate with `bun run typecheck`.
- [ ] 5.5 Validate OpenSpec compliance with `bunx openspec validate --all`.
- [ ] 5.6 Verify Beads issue conventions with `bd lint` and `bd doctor --check=conventions`.

## Dependencies and execution sequence

Execution follows a strict sequential pipeline:
1. `canopy-ax6.1` establishes durable schema status and validation in `@canopy/graph`.
2. `canopy-ax6.2` enforces non-wildcard capability verification and token binding in `@canopy/plugin-host` and `@canopy/graph-access`.
3. `canopy-ax6.3` hardens guest worker isolate security and wall-clock execution limits in `@canopy/plugin-host`.
4. `canopy-ax6.4` implements renderer fallback cascade and structured error boundaries in `apps/web`.
5. `canopy-ax6.5` runs comprehensive quality gates across all touched packages.
