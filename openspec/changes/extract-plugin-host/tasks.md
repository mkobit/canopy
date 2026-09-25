## Approval and execution gates

The [design and adversarial mitigations](design.md) were approved through [PR #537](https://github.com/mkobit/canopy/pull/537) at `aae5b524c61ac70d35f8e61c034c310113adc78a`.
The executor security prerequisite `canopy-fwe` was completed through [PR #538](https://github.com/mkobit/canopy/pull/538) at `1145aa7e5be6e71f6952e361d176aeb2a4b9f784`.
Historical reviewed planning base: `0373849d92d5992c3b47c5670354d4ff0ea49f90`.
The minimum execution-renewal baseline is current `main` at `d01b5e70c0ddf983d4017f0e5a0759d059a877b6`, which includes the renderer contract approved through [PR #545](https://github.com/mkobit/canopy/pull/545) and implemented through [PR #549](https://github.com/mkobit/canopy/pull/549).
Before claim, pin the actual current `main` revision and require it to descend from that minimum baseline.
The historical pending-approval text in the design predates those merges.
The [delivery contract](../agent-delivery-boundaries/design.md) and [handoff template](../agent-delivery-boundaries/handoff-template.md) were approved through [PR #542](https://github.com/mkobit/canopy/pull/542) at `c19969800553819a91bbee1e297450de2832e26e`.

`canopy-7rv.1` tracks preparation and independent packet review only.
Implementation tasks below are staged, unclaimed, and unauthorized for execution.
The complete packets live in their Beads descriptions; this artifact maps the approved work to those records.
Keep the existing `spec-driven` schema and generated instructions unchanged.
Do not archive this change or interpret structural validation as implementation acceptance.

`/root` owns contracts, integration, shared files and final acceptance.
The independent review route is `/root/plan_reviewer`, renewed against the actual execution revision.
Before any implementation claim, obtain separate user authorization, establish clean isolated execution storage, verify current contracts/prerequisites, and renew the packet and independent readiness review.
That renewal must preserve PR #549's fail-closed renderer behavior, worker lifecycle behavior and accepted browser evidence while moving imports and package ownership.
All five unrelated edits in `apps/clip-host/src/{framing,host,index,rate-limiter}.ts` and `tools/eslint-disable-baseline.json` remain reserved.
Planning alignment only is authorized in this renewal; no commit, push, PR, merge, implementation publication or archive is authorized.

## 1. Coupled extraction baseline — canopy-7rv.2

Depends on preparation `canopy-7rv.1` and completed design/security prerequisites `canopy-jxw.2` and `canopy-fwe`.
One integration owner retains all production changes, shared contracts, manifests, lockfile, exports, references, aliases, tooling and consumer cutover through a passing build/typecheck commit.
Do not dispatch independent test workers during this transition or publish broken intermediate PRs.

- [ ] 1.1 Capture reproducible pre-extraction main/worker assets and module evidence at the pinned base, using the same toolchain as the result; verify graph builds and validates manifests before any host build.
- [ ] 1.2 Move shared context, payloads, handlers and protocol-neutral errors into `@canopy/graph-access`; apply approved public renames, preserve operation payloads and `GraphSession.commit`, and use `unknown` with narrowing for error details.
- [ ] 1.3 Move WASM execution, capabilities, bindings, facade and WIT conversion into `@canopy/plugin-host`; preserve bound authority, manifest intersection, termination, vocabulary equality, separate total/per-import fuel controls and PR #549's worker construction, module-load, cleanup and terminated-result handling.
- [ ] 1.4 Update all production consumers, manifests, lockfile, exports, TS references, both web path maps, aliases and the canonical bounded-context map atomically; remove moved api-adapter exports without compatibility aliases; preserve the approved unavailable-interactive classification without an alternate guest, Tier-1 downgrade, frame or plugin output.
- [ ] 1.5 Move inline WIT and its snapshot byte-for-byte; split compatibility tooling and mixed error/schema tests by owner, including the repository-checker test's WIT reachability; retain browser-owned modular worlds and unchanged transport snapshots.
- [ ] 1.6 Move the seven host test files and shared-handler tests, repair retained/app imports, and preserve assertions before declaring a passing baseline; retain the focused worker, tier, block-renderer and Tier-2 component tests plus the renderer-unavailable, Markdown and sandboxed-render browser suites; later tasks complete coverage rather than defer required baseline repairs.
- [ ] 1.7 Add deterministic source-boundary enforcement for normal, type-only, alias, relative, deep and dynamic imports, with allowed/forbidden fixtures wired into the normal dependency quality gate.
- [ ] 1.8 Add main-and-worker production artifact assertions using shipped build resolution, reject missing worker evidence, verify built public entrypoints without source aliases, and wire assertions into the normal quality gate.
- [ ] 1.9 Run clean build, typecheck, relocated regressions, compatibility and new boundary checks; run the PR #549 focused and Chromium preservation matrix; verify its test fixture is absent from production artifacts; record the actual passing commit and renew downstream packets against it before any ownership transfer.

## 2. Host regression completion — canopy-7rv.3

Depends on `canopy-7rv.2` and its actual passing build/typecheck revision.
The packet's current pin is a planning base, not permission to execute against missing packages.
Root must record the new execution pin, verify destination paths, transfer only the listed test files, and renew independent review before claim.
Production, shared fixtures, manifests, baselines and tooling remain root-owned.

- [ ] 2.1 Verify forged-token denial without nodes/events appended, authorized calls, manifest intersection, live-graph dispatch and token-change denial in real Chromium workers.
- [ ] 2.2 Preserve runaway-guest termination, memory limits, nested-worker protections, listener cleanup and terminated-worker result discard; distinguish worker termination from local promise timeouts; preserve unavailable-interactive handling for missing, empty, unknown, construction-failed and module-load-failed workers while ordinary message, guest, runtime, timeout and malformed-output failures retain the generic property fallback.
- [ ] 2.3 Assert total default `1_000_000n`, migrated facade default and explicit execution override separately from per-import default `100n` and its override.
- [ ] 2.4 Complete exact WIT error mapping, vocabulary equality, explicit interactive-render privilege, inline WIT ownership and host-operation preservation coverage; return scoped tests and real browser evidence.

## 3. Shared access and protocol conformance — canopy-7rv.4

Depends on the same renewed `canopy-7rv.2` baseline.
After that gate, this task and `canopy-7rv.3` may use disjoint test scopes on compatible pinned contracts.
The packet reserves all production, shared fixtures, compatibility tooling and host tests to their owners.

- [ ] 3.1 Verify tenant denial, current-session reads, query/replay limits, actual session writes and missing-session errors through the moved shared implementation.
- [ ] 3.2 Verify exact GraphQL/gRPC error payloads and unchanged protocol snapshots; root combines protocol results with the separately owned WIT evidence.
- [ ] 3.3 Run real CLI/daemon/Unix-socket/native-messaging conformance, including extension capture serialization; return exact outcomes without adding a protocol-test dependency on plugin-host.

## 4. Independent integrated acceptance — canopy-7rv.5

Depends on both regression tasks and root's combined revision.
The reviewer has no tracked-file, issue-write or publication authority.
Root owns repairs and renews affected evidence and review after material baseline changes.

- [ ] 4.1 Independently assess all ten [plugin-host-boundary scenarios](specs/plugin-host-boundary/spec.md), source/artifact negative cases, actual main/worker module graphs, built exports and byte-identical contracts against the returned revision.
- [ ] 4.2 Verify real worker and IPC/native-messaging evidence, clean graph-first validation, browser WIT generation and same-toolchain before/after asset measurements without an unsupported size-reduction claim.
- [ ] 4.3 Run and review `mise run check`, both compatibility targets, focused `execute-wasm-render-worker`, `render-tier`, `block-renderer` and `tier2-rendered-block` tests, `renderer-unavailable`, Markdown and sandboxed-render browser integration tests, and `bun run apps/web/scripts/bench-wasm-render.ts`; retain benchmark non-gating semantics and record toolchain/results.
- [ ] 4.4 Record independent findings, resolve them within approved scope, renew affected checks/review, and obtain root's integrated acceptance; publication, merge, issue closure and archive remain subject to separately assigned authority.

## Scenario ownership

Exact scenario headings refer to the [approved specification](https://github.com/mkobit/canopy/blob/aae5b524c61ac70d35f8e61c034c310113adc78a/openspec/changes/extract-plugin-host/specs/plugin-host-boundary/spec.md).
Every packet contains the linked scenario matrix, observable expected results and commands.
All scenarios require final independent review under `canopy-7rv.5`.

| Scenario                                           | Implementation and evidence owner                                 |
| :------------------------------------------------- | :---------------------------------------------------------------- |
| Browser and worker build without transport modules | `canopy-7rv.2`                                                    |
| Forbidden source import fails the quality gate     | `canopy-7rv.2`                                                    |
| Access behavior survives extraction                | `canopy-7rv.2`, host evidence `.3`, protocol/shared evidence `.4` |
| Error conversion preserves compatibility           | `canopy-7rv.2`, WIT `.3`, protocol/shared `.4`                    |
| Guest token cannot escalate authority              | `canopy-7rv.2`, `.3`                                              |
| Runaway guest remains bounded                      | `canopy-7rv.2`, `.3`                                              |
| Fuel controls retain their individual meanings     | `canopy-7rv.2`, `.3`                                              |
| Contract checks after extraction                   | `canopy-7rv.2`, `.3`, `.4`                                        |
| Manifest validation without host build             | Root under `canopy-7rv.2`, vocabulary evidence `.3`               |
| Built package consumers resolve migrated exports   | `canopy-7rv.2`, retained protocol evidence `.4`                   |
