# Effect 4 migration evidence

## Revision and authority

The approved design is PR #572, merged at `6480f626d8cd9a1f121a32d762f6b14af634b4a0`.
Root verified the merged design, two independent adversarial reviews, and approved mitigations before preparing tasks.
The implementation worktree is `.worktrees/effect-4-migration` on `migration/effect-4`.
Its `HEAD` remains the approved base; implementation changes are uncommitted.
The main checkout remains unchanged.
Root claimed `canopy-mpb` and retains all issue, Git, PR, merge, and closure authority.
The user approved the implementation plan and proceeding with the recorded base performance failure.
That approval does not authorize a test threshold increase or acceptance without the required review and checks.

## Completed focused evidence

- The untouched base passed build, lint, and type checks in SBX.
- Its test run had 980 passes and one SQLite cold-start failure at 14174.67698 ms against 10000 ms.
- The full base pipeline took 861.88 seconds; its test phase took 74.42 seconds.
- Base IPC load checks completed 1000 handshakes in 100.93 ms and 1250 deliveries in 62.64 ms.
- The base IPC test child used peak resident memory of 111251456 bytes.
- The dependency writer completed the approved install, frozen install, and closure review.
- The IPC repair passed six tests with 25 assertions, format, lint, and adapter type checks before the final two-pending-request assertion correction.
- The slow-consumer test passed with ten assertions in 15.76 seconds, using real sockets and the existing 15-second timeout.
- Its eight 256 KiB node IDs are valid existing inputs and remain below the event count and line size limits.
- Daemon shutdown, restart, and occupied-socket checks passed with real child processes and SQLite.
- The occupied-socket test also checks the actual socket-in-use diagnostic.
- CLI checks cover live output before completion, error and defect visibility, and successful Ctrl+C exit after real event delivery.
- Root compared 26 baseline stdout and stderr captures with zero remaining differences.
- That comparison removes only ANSI, timestamps, fiber IDs, isolated socket paths, and source locations.
- Independent review found no remaining source blockers; integrated checks remain required.

The baseline invalid-argument commands write both the structured stdout diagnostic and a stderr message with a blank line.
An earlier handoff incorrectly described stderr as empty; the final repair restores the actual captured behavior.
Generic CLI and daemon failures retain the baseline multiline error layout.

## Dependency closure

The direct `effect` pins are `4.0.3` in the adapter, CLI, daemon, and clip host.
CLI and daemon pin `@effect/platform-node` to `4.0.3`.
The root override resolves transitive `@effect/platform-node-shared` to `4.0.3`.
The removed Effect 3 CLI and platform packages are absent from the reviewed closure.

| Package                              | Declared dependencies             | Required peers                          | Resolved peers                |
| :----------------------------------- | :-------------------------------- | :-------------------------------------- | :---------------------------- |
| `effect@4.0.3`                       | None                              | None                                    | None                          |
| `@effect/platform-node@4.0.3`        | `undici ^8.11.2`, shared `^4.0.3` | `effect ^4.0.3`, `redis >=5.0.0 <7.0.0` | `effect@4.0.3`, `redis@6.3.0` |
| `@effect/platform-node-shared@4.0.3` | `ws ^8.22.0`, `@types/ws ^8.18.2` | `effect ^4.0.3`                         | `effect@4.0.3`                |

The reviewed metadata declares no optional peers for these packages.
The resolved dependency versions include `undici@8.12.2`, `ws@8.22.0`, and `@types/ws@8.18.2`.
The full dependency tree is in `.superpowers/sdd/tasks/task-2-dependency-tree.txt`.

## Final checks and review

Root corrected the cancellation test to keep two requests pending before interrupting one.
Root changed daemon child cleanup to attempt all children before reporting cleanup failures.
The renewed focused check passed 25 tests with 72 assertions across six files.
ESLint and Prettier passed for the three final test corrections.
The lint suppression ceiling decreased from 200 to 198.
Strict validation of the migration change passed after saving this handoff.
Root started one final SBX `bun install --frozen-lockfile` and `mise run check` with an automatic result writer.
The frozen install passed in 1.42 seconds and left the lockfile unchanged.
The full build passed.
The first full check stopped at five daemon test lint errors after 513.09 seconds.
The errors were numeric separator formatting, one unused import, and one line format.
A Luna worker corrected only those three test files.
Scoped ESLint and seven daemon tests with 52 assertions then passed.
The remaining lint checks passed, including the lint ceiling, dependency graph, plugin artifacts, package exports, and CI tooling.
Root retained the successful build and unrelated workspace lint evidence because the corrections changed only test formatting and an unused test import.
The resumed full workspace type check passed in 212.15 seconds.
The ordered `bun run test` passed 987 tests with zero failures in 29.84 seconds.
The SQLite package passed all ten tests; the base cold-start failure did not recur in this run.
Strict OpenSpec validation passed all 54 items.
This resumed sequence does not establish a new successful invocation of `mise run check`.
Check `.superpowers/sdd/tasks/final-check-report.md`, `final-check-result.json`, `final-frozen-install.log`, and `final-check.log` for results.
Do not assume these files exist or show success before reading them.

Real default-path startup checks passed in SBX with isolated XDG paths.
The default CLI created and fetched a CodeBlock through the daemon, with matching ID, type, and properties.
The default SQLite file had a valid header after the mutation.
Explicit persistent and ephemeral modes passed the same live write check.
All three daemon modes exited successfully on SIGINT and removed their sockets.
The ephemeral mode created no database file.
The isolated final IPC load check passed both tests with 1,000 handshakes in 160.19 ms and 1,250 pushes in 75.75 ms.
Both timings satisfy the existing 10-second and 5-second limits.
Peak child resident memory was 107577344 bytes, compared with 111251456 bytes at the base.
The root `bun test` command used by `mise` passed 994 tests across 141 files with zero failures and 21714 assertions in 50.27 seconds after this isolated load check.
The recorded base SQLite cold-start failure did not recur in either final test command.
The final read-only Luna review found no blockers in CLI output and errors, IPC cancellation and termination, or daemon shutdown and occupied-socket cleanup.
That review did not rerun checks or cover every changed file; root retains the earlier independent reviews for the remaining source scope.
Renew affected checks after any source correction.
Do not merge, close the issue, or archive the change until integrated acceptance and required CI pass.

## Follow-up issues

- `canopy-0ru`: SQLite cold-start cost and a downward performance budget.
- `canopy-vyy`: IPC timeout test cost and diagnostics.
- `canopy-nda`: CI test budgets and controlled quarantine with owners and expiry.
- `canopy-l8y`: cohesive CLI execution and error presentation.
- `canopy-kr2`: duplicated CLI synopsis and option metadata.
- `canopy-4m9`: existing graph property Map serialization at the IPC event boundary.
- `canopy-bro`: limit generated-help capture without queuing application output.
- `canopy-kn7.3`: bounded sandbox agent stalls and resumable progress.
- `canopy-q4h`: evaluate subscriber buffer ownership, acknowledgement, and consumer queues.
- `canopy-ssp`: evaluate generated declaration dependencies and workspace lint cost.

Root also added concrete host and sandbox command failures to the existing `canopy-kn7` delivery design issue.
These records do not authorize unrelated implementation or weaken migration acceptance.
The output capture concern has a migration correction and a regression test; close its issue only after integrated acceptance.

## Execution limits and recovery

Use the existing `canopy-codex` environment with an explicit integration workdir.
Commands inside that sandbox run `bun` and `bunx` directly; they must not launch nested `sbx` or Docker commands.
The installed Codex executable is `/home/agent/.bun/bin/codex`.
Keep the tool HOME fixed and resolve the installed Bun executable before isolated XDG tests.
Two Codex requests stalled and were stopped before resuming their saved sessions.
Later Codex and stronger reviewer requests reached usage limits.
Their edits remain in the worktree; their interrupted reports do not establish completed acceptance.
The Luna final gate and independent review use the available root delegation tools.
