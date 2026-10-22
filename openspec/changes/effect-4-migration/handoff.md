# Effect 4 migration handoff

Status: migration source and test isolation repair passed local acceptance and independent review; fresh CI is pending.
Read [current evidence and remaining checks](evidence.md) before dispatch or integration.

## Authority and outcome

- Bead: `canopy-mpb`.
- Outcome: all four Effect consumers run on the approved Effect 4 family and satisfy the existing application contracts plus the approved client cleanup correction.
- Approved design: [design.md](design.md) and [requirements](specs/effect-runtime-migration/spec.md), pinned at `6480f626d8cd9a1f121a32d762f6b14af634b4a0`.
- Approval: [PR #572](https://github.com/mkobit/canopy/pull/572), verified as merged with that exact merge commit by `gh pr view 572 --json state,mergedAt,mergeCommit,body,reviews,url`.
- Review evidence: the merged PR records two independent Luna adversarial reviews, all blockers resolved, and approved mitigations.
- Base: `6480f626d8cd9a1f121a32d762f6b14af634b4a0`; the design review baseline is `87f47ba99db0acde59f6ed6ebabf085c412faf39`.
- Prerequisites: merged design and mitigations verified; clean base and `origin/main` identity verified; baseline build, lint, and typecheck passed.
- Baseline tests: `980` passed and one SQLite cold-start performance test failed at `14174.67698 ms` against `10000 ms`; no migration code existed at that run.
- The user explicitly approved proceeding and recording this base failure; do not change its test or threshold in this migration.
- Base CLI/daemon help and error outputs were captured; the unchanged main checkout remains available for the remaining load and startup comparison evidence.
- Integration owner: `/root`.
- Independent reviewers: root-appointed Luna reviewers, including the final read-only `/root/acceptance_worker` review, independent of source implementation.
- Claim mode: root claims the authoritative local issue with `bd update canopy-mpb --claim` and supplies this packet to workers.
- Action authority: root alone updates issues, makes integration commits, pushes the feature branch, creates the PR, decides merge readiness, and closes the issue after acceptance.
- Workers may edit their assigned files and run checks in SBX; they must not update issues, commit, push, create a PR, merge, or close issues.
- A worker result does not confer publication authority.
- Do not merge until independent review and the approved acceptance checks pass.

## Context and boundaries

Read [AGENTS.md](../../../AGENTS.md), [core tenets](../../../docs/architecture/core-tenets.md), [core data model](../../../docs/design/2026-02-06-core-data-model.md), and [bounded contexts](../../../docs/architecture/bounded-contexts.md).
Read the [delivery design](../agent-delivery-boundaries/design.md), [delivery requirements](../agent-delivery-boundaries/specs/bounded-agent-delivery/spec.md), and [task plan](tasks.md).

Consumed contracts at the base revision:

- [IPC transport](../../specs/unix-socket-ipc-transport/spec.md): framing, method names, permissions, correlation IDs, capabilities, and subscription cleanup.
- [Daemon host](../../specs/agent-daemon-host/spec.md): loaded graph session, foreground lifetime, scoped listener, and signal cleanup.
- [Persistence](../../specs/event-log-persistence/spec.md): events as the sole source of persisted graph state and replay.
- [Pinned upstream sources](design.md#upstream-sources): use exact `4.0.3` signatures and package metadata.

Provided contracts remain the exported IPC client operation types and typed errors, CLI command interface, daemon entrypoint, and clip-host protocol.
The approved client correction adds per-request cancellation cleanup and typed settlement on close without changing wire messages.
All graph mutations continue through `GraphSession.commit`.

Owned implementation files:

- Dependency writer `/root/migration_worker`: root `package.json`, `bun.lock`, `packages/api-adapter/package.json`, `apps/cli/package.json`, `apps/daemon/package.json`, and `apps/clip-host/package.json`.
- The same worker owns only `packages/api-adapter/src/ipc/ipc-client.ts` and `packages/api-adapter/tests/ipc-client.test.ts` after the dependency checkpoint.
- Consumer worker `/root/consumer_worker` owns `apps/cli/src/`, the four CLI command tests named in the design, `apps/daemon/src/index.ts`, and `apps/clip-host/src/host.ts`.
- That worker may add `apps/daemon/src/cli-output.ts` for the supported formatter layer needed to preserve the approved help, error, and version output.
- Keep formatter code local to each application; do not introduce cross-application imports, a new shared package, or new dependencies.
- Derive output from existing command and help metadata where available; add only the missing readonly presentation metadata needed for the existing command synopses and type explanations.
- Do not ship captured complete help output as production lookup responses or weaken the exact baseline comparison.
- The installed dependency checkpoint is the approved `4.0.3` family, verified by frozen install, dependency tree, and installed package metadata; exported IPC operation types remain unchanged.
- Acceptance worker `/root/lifecycle_worker` owns `apps/daemon/tests/` and `packages/api-adapter/tests/ipc-server-streaming.load.test.ts`, with an adjacent focused slow-consumer test permitted.
- Test authoring may proceed beside source work against the fixed raw IPC and host contracts at the base; root verified the existing host tests in the baseline run, whose only failure was the recorded SQLite performance test.
- The lifecycle worker must wait for root to confirm entrypoint readiness before executing its new child-process tests; root renews integrated acceptance after all source changes.
- That worker may also shorten only the socket path helper in `packages/api-adapter/tests/draft-flow.test.ts` to support the isolated worktree within Unix socket path limits.
- Current dependency instructions may change only if they state the active Effect package set; historical research and plans remain historical.

Reserved shared files: root owns this packet and `tasks.md`.
Only the dependency writer may edit manifests and `bun.lock`.
The implementation worker may write `.superpowers/sdd/tasks/task-2-report.md`.
The consumer worker may write `.superpowers/sdd/tasks/task-2-consumer-report.md`.
The lifecycle worker may write `.superpowers/sdd/tasks/task-3-report.md`.
Root owns `.superpowers/sdd/tasks/progress.md` and the remaining coordination records.
Workers must return any required edit outside their scope to root.
Root must renew the packet before transferring file ownership or changing the integration baseline.
After the dependency checkpoint, the IPC and consumer workers may edit their disjoint scopes concurrently under root integration ownership.
The IPC worker confirmed that it had not started editing the transferred consumer files.
Workers coordinate builds through root to avoid concurrent writes to generated declarations.
All combined scenario checks and independent review must use the resulting integrated source revision.

Non-goals: domain changes, new graph types, persistence format changes, authorization changes, IPC protocol changes, production timeouts, startup signal races, new instrumentation, unrelated dependency upgrades, and OpenSpec schema or generated instruction changes.
No Effect stream migration is required.

Isolation: `/home/mkobit/workspace/mkobit/canopy/.worktrees/effect-4-migration`, branch `migration/effect-4`.
The existing `canopy-codex` SBX mounts the main checkout, including this nested worktree.
Use `sbx env exec --workdir /home/mkobit/workspace/mkobit/canopy/.worktrees/effect-4-migration .sbx/sbxenv.yaml -- COMMAND` for implementation checks.
Do not infer the sandbox working directory from the host current directory.
Keep each check's sockets, SQLite files, and child processes in separate temporary directories.
Keep host Git, credentials, commits, and pushes outside SBX.

### Remaining SBX development loop

The first three workers returned their changes and stopped editing.
Root transfers the slow-consumer test to a Codex worker running inside the existing SBX environment with model `gpt-6-luna`.
That worker owns only `packages/api-adapter/tests/ipc-server-slow-consumer.test.ts` and `.superpowers/sdd/tasks/sbx-slow-consumer-report.md`.
It must diagnose the real socket boundary, repair the test, and run its focused test, format, lint, and type checks inside SBX.
It must preserve the existing 15-second production timeout and prove termination of the slow subscription while the other subscription remains usable.
Production code, other tests, manifests, lockfile, and acceptance requirements remain reserved.
Root authorizes a second Codex worker inside SBX to finish the consumer scope returned by the first consumer worker.
It owns `apps/cli/src/`, the four CLI command tests, `apps/daemon/src/index.ts`, `apps/daemon/src/cli-output.ts`, and `.superpowers/sdd/tasks/sbx-consumer-report.md`.
It may use an invocation-scoped supported `Console` service with `Command.run({ renderErrors: false })` and typed `CliError.ShowHelp` handling to preserve the existing error streams and output.
This is a presentation adapter at the executable boundary; no new parser, global console replacement, cross-application package, or new dependency is authorized.
Keep all real errors visible, preserve explicit help and successful output exactly once, and retain failure exit status.
The worker must run its edit, test, lint, and type repair loop directly inside SBX with installed `bun` and `bunx`, without nested `sbx` commands.
Compare the concrete output with the root-supplied base captures; stop if preserving the contract requires changes beyond this scope.
The combined source still requires independent review and integrated acceptance.
The independent IPC review found missing explicit-close subscription/isolation assertions and missing error mapping assertions.
Root verified these gaps and transfers only `packages/api-adapter/tests/ipc-client.test.ts` to a scoped Codex repair worker inside SBX.
That worker also owns `.superpowers/sdd/tasks/sbx-ipc-review-repair.md` and must run the focused test, format, lint, and type repair loop directly inside the sandbox.
No IPC production or dependency edits are authorized in that repair.
The final gate passed build and found five lint errors in daemon test files.
After that gate terminates, the Luna gate worker may correct only numeric formatting, the unused `crypto` import, and Prettier output in `apps/daemon/tests/host-persistence.test.ts`, `host-shutdown.test.ts`, and `test-support.ts`.
That worker must renew focused checks and the remaining quality gate, with separate logs.
Retain the successful build evidence only while production files and build inputs remain unchanged.
Host SBX calls require the approved elevated tool execution context when the restricted context reports a login-service access error.
Do not change authentication, rebuild the environment, or try additional launcher variants for that known permission failure.

### CI test isolation repair

Linux coverage CI at `8fae9bd` failed the unchanged renderer constructor-failure test after the Tier-2 component suite.
The shared warm worker pool can bypass that test's supplied throwing factory.
Root transfers only `apps/web/src/components/renderers/execute-wasm-render-worker.test.ts` and one adjacent test fixture, if needed, to `/root/migration_worker`.
The worker must prove the ordered coverage failure before editing, isolate the test process, and verify both suite orders and the full web coverage suite.
Run scoped lint and type checks and return exact evidence for independent review.
Preserve every existing assertion, production renderer APIs and pool behavior, dependencies, and thresholds.
Root retains integration and publication authority and renews affected acceptance at the resulting revision.
The production pool ownership question remains evaluation issue `canopy-dss`.
Deterministic build and test infrastructure is evaluation issue `canopy-io6`.
The cancelled unchanged CI rerun does not resolve this failure.
Root took final ownership of the test and fixture after the worker handoff.
The final fixture is `apps/web/src/components/renderers/tests/execute-wasm-render-worker.fixture.ts`.
Both suite orders, full web coverage, scoped lint, direct type checking, and unused-file validation passed after the final corrections.
Independent review approved the final two-file repair.
All further source edits require root assignment; the earlier worker scope is closed.

You are not alone in the codebase.
Preserve other contributors' edits and report conflicts to root.
Do not spawn implementation helpers or reviewers; root dispatches independent review.

## Acceptance evidence

Every scenario below is in the [approved migration requirements](specs/effect-runtime-migration/spec.md).

| Scenario                                                                  | Observable result                                                                                                             | Check                                                                                |
| :------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| Frozen install resolves the approved package family                       | Exact direct pins and shared override; no Effect 3 family; every peer accepts its resolved version; frozen lockfile unchanged | `bun install --frozen-lockfile`, `bun pm ls --all`, resolved metadata review         |
| Incompatible resolved closure stops implementation                        | Stop and report the package/peer mismatch without unrelated pins                                                              | Dependency writer evidence before consumer edits                                     |
| Existing CLI invocations keep their results                               | Help, argument/default parsing, errors, output, and exits match the base                                                      | Four CLI suites and captured real-entrypoint commands                                |
| Daemon entrypoint preserves its CLI contract                              | Flags, defaults, foreground boot, errors, and exits match the base                                                            | Daemon smoke commands and child-process tests                                        |
| IPC requests keep their contract                                          | Existing framing, methods, permissions, capabilities, typed errors, and commit path remain                                    | `bun test packages/api-adapter/tests/ipc-client.test.ts` and existing IPC suites     |
| A slow consumer loses only its own subscription                           | Real 15-second drain timeout terminates that subscription; another subscriber continues                                       | Real-socket slow-consumer test without hooks                                         |
| A mutation sent through IPC is readable after restart                     | Same SQLite file reconstructs the committed graph state after daemon restart                                                  | `bun test apps/daemon/tests/host-persistence.test.ts`                                |
| Interrupting one pending request preserves the shared client              | Only that ID is removed; late response ignored; second request and subscriptions work                                         | Real-socket IPC client suite                                                         |
| Interrupting connection setup releases its own socket                     | Socket and listeners released with once-only completion; other clients unaffected                                             | Real-socket IPC client suite                                                         |
| Peer close or error settles all pending requests                          | Typed once-only errors; pending requests/subscriptions cleared; another client usable                                         | Real-socket IPC client suite                                                         |
| Explicit client close settles all pending requests                        | Typed once-only errors; subscriptions stop; socket released once                                                              | Real-socket IPC client suite                                                         |
| Daemon shutdown handles both supported signals with active clients        | `SIGINT` and `SIGTERM` close connections/subscriptions, remove socket, and exit successfully within timeout                   | `bun test apps/daemon/tests/host-shutdown.test.ts`                                   |
| Occupied-socket startup failure closes SQLite and preserves the incumbent | Failed child exits nonzero; incumbent still serves; new child reuses DB on a fresh socket                                     | `bun test apps/daemon/tests/host-second-listener.test.ts`                            |
| Concurrent IPC handshakes remain within the existing limit                | All 1,000 handshakes complete under 10 seconds                                                                                | IPC streaming load suite; record completions, elapsed time, and peak resident memory |
| Subscription pushes remain within the existing limit                      | All 1,250 pushes complete under 5 seconds                                                                                     | IPC streaming load suite; record completions, elapsed time, and peak resident memory |

CLI focused check:

```bash
bun test apps/cli/tests/cli-commands.test.ts apps/cli/tests/events-command.test.ts apps/cli/tests/status-command.test.ts apps/cli/tests/types-and-query-commands.test.ts
```

IPC focused check:

```bash
bun test packages/api-adapter/tests/ipc-client.test.ts packages/api-adapter/tests/ipc-server-streaming.load.test.ts
```

Required ordered gates: `bun install --frozen-lockfile`, `bun run build`, `bun run lint`, `bun run typecheck`, and `bun run test`.
Root also runs the integrated SBX `mise run check` and reviews the final closure, all acceptance evidence, file scope, and independent review.
Run build before lint on the fresh worktree.
Do not weaken assertions, immutable rules, or the lint disable ceiling.

### Real entrypoint comparison

The raw base outputs and exit codes are in `/tmp/canopy-effect-4-baseline/`.
The capture script is `/tmp/canopy-effect-4-baseline/capture.sh`.
Run these CLI commands from `apps/cli` through SBX with fixed tool `HOME` and isolated `XDG_RUNTIME_DIR`, `XDG_DATA_HOME`, and `CANOPY_SOCKET_PATH`:

```bash
bun run src/index.ts --help
bun run src/index.ts status --help
bun run src/index.ts node --help
bun run src/index.ts edge --help
bun run src/index.ts types --help
bun run src/index.ts query --help
bun run src/index.ts events --help
bun run src/index.ts node list --limit nope
bun run src/index.ts --not-a-flag
bun run src/index.ts status
```

Run these daemon commands from `apps/daemon` with the same path isolation:

```bash
bun run src/index.ts --help
bun run src/index.ts --not-a-flag
bun run src/index.ts --socket-path relative.sock --ephemeral
```

Help commands must exit `0`; the listed invalid or disconnected invocations must exit `1`.
Compare stdout and stderr separately with the recorded base.
Remove only ANSI escapes, Effect timestamps and fiber IDs, temporary/source path prefixes, and recorded one-time tool setup lines.
Do not remove command text, option descriptions, errors, or application output from the comparison.
Record the full commands and every remaining difference.
Successful real IPC commands and daemon defaults/startup use isolated daemon paths and are also covered by the real child-process acceptance tests.
The baseline capture report records the exact repeat command for the migration worktree.

## Escalation and return

Stop dependent work for a contradictory contract, missing prerequisite, incompatible package closure, or required edit outside the assigned scope.
Report the exact mismatch, affected scenario, and minimal options to root.
Do not replace missing semantics with a compatibility layer or weaken checks.
The current test helpers include process and script tokens in explicit argv arrays.
Verify the pinned `Command.runWith` signature and adapt those wrapper tokens at the runner boundary while preserving the same user commands and existing assertion inputs.
If observable CLI text or exit behavior cannot be preserved with the approved APIs, return the mismatch to root before accepting the change.

Return base and resulting revision identity, changed files, scenario evidence, exact commands and outcomes, and remaining concerns in a report file.
Use the assigned `.superpowers/sdd/tasks/task-2-report.md` or `task-3-report.md` report path.
Record failed attempts as well as successful checks.
Recheck this packet and pinned contracts before handoff.
Root renews affected checks and independent review after a material source or baseline change.
Do not archive the OpenSpec change on the strength of task completion alone.
