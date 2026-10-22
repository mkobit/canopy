# Effect 4 migration implementation plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` for bounded implementation and independent review.

**Goal:** Run the adapter, CLI, daemon, and clip host with the approved Effect 4 family while preserving their approved contracts.

**Architecture:** Keep Effect at the application and adapter boundaries.
Keep dependency and consumer changes under one integration owner until they build together.
Use the existing event log, graph session, and Unix socket interfaces.

**Tech stack:** TypeScript, Bun, Effect `4.0.3`, SQLite, and SBX.

**Spec:** [Approved design](design.md) and [migration requirements](specs/effect-runtime-migration/spec.md).
Approval: [PR #572](https://github.com/mkobit/canopy/pull/572), merged at `6480f626d8cd9a1f121a32d762f6b14af634b4a0`.
The integration owner verified the merged state, commit, and review summary with `gh pr view 572` before creating this file.
The review baseline is `87f47ba99db0acde59f6ed6ebabf085c412faf39`.
The implementation base is `6480f626d8cd9a1f121a32d762f6b14af634b4a0`.

## Global constraints

- Pin direct `effect` dependencies to `4.0.3` in the four approved consumers.
- Pin direct `@effect/platform-node` dependencies to `4.0.3` in CLI and daemon.
- Remove direct `@effect/cli` and `@effect/platform` dependencies.
- Use only the approved root override for transitive `@effect/platform-node-shared@4.0.3`.
- Verify the full resolved Effect closure and each declared peer range.
- Stop for design review if the approved pins cannot produce the approved closure.
- Preserve graph, persistence, IPC wire, authorization, and CLI contracts.
- Do not add Effect to `@canopy/graph` or change domain types.
- Do not add production timeouts, test hooks, lint suppressions, or unrelated upgrades.
- Keep one writer for all manifests and `bun.lock`.
- Keep all existing assertions enabled.
- Use isolated worktrees and SBX for execution.
- Keep OpenSpec on its current schema; do not regenerate agent instructions.
- Root owns issue updates, integration commits, pushes, PR creation, merge decisions, and closure.
- Workers return changes and evidence; they do not publish, update issues, or merge.

## Review focus

- A late response after request interruption must not complete another request or close the shared client.
- Close and error races must settle all pending requests once and release owned listeners.
- CLI argument adapters must preserve the same user arguments when the runner API changes.
- A failing second daemon must preserve the incumbent client and permit reuse of its database path.
- A slow subscriber must lose only its own subscription after the existing drain timeout.

## Task 1: Verify prerequisites and capture the base

**Files:** Read the approved design, requirement sources, consumer manifests, and existing acceptance tests.
Store raw baseline evidence outside tracked source files.

**Interfaces:** Consume the approved base and contracts.
Produce recorded baseline commands, outputs, exits, completion counts, and peak resident memory for comparison.

- [x] Verify clean repository state, merged design approval, adversarial review, and approved mitigations.
- [x] Put the completed bounded handoff packet in the Beads task before the atomic claim.
- [x] Verify SBX command working directories; an existing named sandbox can retain its original workspace.
- [x] Run baseline `sbx env exec .sbx/sbxenv.yaml -- mise run check`.
- [x] Capture real CLI and daemon help, invalid arguments, defaults, errors, output, and exit status with isolated paths.
- [x] Run the existing IPC load tests and record 1,000 handshakes, 1,250 deliveries, elapsed times, and peak resident memory.
- [x] Verify the pinned upstream package metadata and API signatures before editing consumers.

## Task 2: Migrate the coupled package family and consumers

**Files:** Root `package.json`, `bun.lock`, `packages/api-adapter/package.json`, `apps/cli/package.json`, `apps/daemon/package.json`, `apps/clip-host/package.json`.
Consumer source: `packages/api-adapter/src/ipc/ipc-client.ts`, `apps/cli/src/index.ts`, `apps/cli/src/options.ts`, `apps/cli/src/commands/`, `apps/daemon/src/index.ts`, and `apps/clip-host/src/host.ts`.
Tests: `packages/api-adapter/tests/ipc-client.test.ts` and the four CLI command test files named in the design.
Update current dependency instructions only where they describe the active package set.

**Interfaces:** Preserve the exported `IpcClient` operation signatures and typed `IpcClientError` mapping.
Preserve command names, user arguments, output, and exit status.
Produce one building Effect 4 consumer baseline for lifecycle acceptance.

- [x] The assigned dependency writer changes the approved direct pins and root override, then installs the closure in SBX.
- [x] Record resolved Effect packages and their exact package metadata, required and optional peers, and resolved peer versions.
- [x] Run `bun install --frozen-lockfile` and `bun pm ls --all`; require no lockfile change and no Effect 3 runtime or peer package instance.
- [x] Replace connection setup with pinned `Effect.callback` and make each request wait cancelable through its registration finalizer.
- [x] Add failing real-socket tests for interrupted setup, interrupted request, ignored late response, clean peer close, error, and explicit close.
- [x] Keep typed errors and once-only settlement; remove only the interrupted correlation ID and callback.
- [x] On client termination, settle remaining requests, clear subscriptions, and release the socket and owned listeners once.
- [x] Keep a second request, subscriptions, and an unrelated client usable where the contract permits operation.
- [x] Migrate CLI imports, `Flag` and `Argument` constructors/combinators, root live argv execution, and explicit test argv runners against pinned source signatures.
- [x] Preserve the current user argument arrays; adapt process/script prefixes at the test runner boundary if the pinned runner consumes command arguments only.
- [x] Replace `NodeContext.layer` with verified `NodeServices.layer` and check required CLI services.
- [x] Replace `Effect.either` with `Effect.result` and its `Failure.failure` / `Success.success` branches in status, events, and clip host.
- [x] Run build, focused IPC and CLI tests, and clip-host tests; keep existing assertions and add both result branches where needed.
- [x] Compare real entrypoint evidence with the captured base; report any output mismatch instead of accepting it silently.
- [x] Obtain independent review of the coupled source change and renew tests after corrections.

## Task 3: Prove lifecycle, persistence, and backpressure boundaries

**Files:** `apps/daemon/tests/host-persistence.test.ts`, `apps/daemon/tests/host-shutdown.test.ts`, `apps/daemon/tests/host-second-listener.test.ts`, and test support under `apps/daemon/tests/`.
Use `packages/api-adapter/tests/ipc-server-streaming.load.test.ts` or a focused adjacent test file for real slow-consumer coverage.
The existing socket path helpers in that file, `packages/api-adapter/tests/draft-flow.test.ts`, and daemon test support may use a short temporary directory to support isolated worktrees within Unix socket path limits.
Production graph, persistence, and server contracts remain reserved.

**Interfaces:** Consume the approved host and raw IPC contracts at the pinned base.
Test authoring can run beside the disjoint source work because those public contracts remain fixed.
Run the new tests only after the migrated entrypoint is ready, then renew all evidence on the integrated source.
Produce tests that exercise real sockets, SQLite, child processes, and subscription cleanup.

- [x] Add a failing restart test: commit a mutation through IPC, stop the daemon, restart on the same SQLite file, and read the persisted graph state.
- [x] Extend shutdown coverage to `SIGINT` and `SIGTERM` with a connected client and live subscription.
- [x] Assert successful bounded exit, connection closure, no later subscription delivery, and socket removal.
- [x] Force-kill timed-out children only for test cleanup and fail the timed-out test.
- [x] Extend second-listener coverage to a real failing child with SQLite, an incumbent socket/client, bounded nonzero exit, and database reuse by a new daemon on a fresh socket.
- [x] Exercise the existing 15-second drain timeout with a real paused Unix-socket consumer and enough bounded traffic to cause backpressure.
- [x] Assert that the slow subscription terminates while an unaffected subscriber receives both the burst and a later event.
- [x] Run focused daemon and IPC tests in SBX and obtain independent review.

## Task 4: Verify and publish the combined result

**Files:** Integration evidence and this task record.
Root reviews all changed files and owns integration.

**Interfaces:** Consume all source and test changes at one recorded revision.
Produce reviewed acceptance evidence and a reviewable PR.

- [x] Run `bun install --frozen-lockfile`, `bun run build`, `bun run lint`, `bun run typecheck`, and `bun run test` in order.
- [x] Run the IPC load suite under the same SBX environment as the base and record completions and peak resident memory.
- [x] Require 1,000 handshakes under 10 seconds and 1,250 subscription pushes under 5 seconds.
- [x] Run all real-socket, persistence, shutdown, collision, CLI integration, and real entrypoint checks required by the design.
- [x] Complete the SBX `mise run check` phases with the explicit integration workdir; retain the passed build and unaffected lint evidence after the documented test-only formatting repair, then run the remaining phases in CI order.
- [x] Recheck closure metadata, frozen lockfile, socket permission tests, lint ceiling, and changed-file scope.
- [x] Obtain independent whole-change review against the final revision and all approved requirements.
- [ ] File unresolved work, update issue evidence, commit, rebase, push the branch, and verify remote synchronization.
- [ ] Create a PR with source links and exact acceptance evidence; merge only after the required review and CI checks pass.
- [ ] Close the implementation task only after integrated acceptance and authorized landing.

## Task 5: Repair the CI test isolation failure

**Files:** `apps/web/src/components/renderers/execute-wasm-render-worker.test.ts` and one adjacent test fixture if needed.
Production renderer code, dependencies, and thresholds remain reserved.

- [x] Prove the existing constructor-failure test depends on suite order under coverage.
- [x] Isolate its worker state and preserve every existing assertion.
- [x] Pass both suite orders, full web coverage, scoped lint, and type checks.
- [x] Obtain independent review of the final test repair.
- [ ] Require fresh CI against the repaired commit before merge.
