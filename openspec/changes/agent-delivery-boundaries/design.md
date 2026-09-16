## Context

Status: proposed; maintainer approval pending.
Tracking: `canopy-egu` and `canopy-ax6`.
No `tasks.md` or implementation beads may be staged before adversarial review and approval through a merged design PR.

The product foundation is [Core tenets](../../../docs/architecture/core-tenets.md).
The [current bounded-context map](../../../docs/architecture/bounded-contexts.md) describes implemented package ownership.
The [plugin-host extraction design](../extract-plugin-host/design.md) demonstrates an approved future boundary whose package layout must not be mistaken for already-landed code.
The [deferred coordination proposal](../archive/2026-06-22-agentic-coordination-protocol-deferred/proposal.md) explored routing labels and automatic task seeding; those mechanisms remain outside this proposal.

## Goals and non-goals

Goals:

- Give each execution agent a finite assignment with resolved semantics and objective evidence of completion
- Let domain contexts evolve independently when their consumed and provided contracts stay compatible
- Preserve one coherent product across graph, rendering, storage, protocols, plugins, and deployment surfaces
- Make integration and uncertainty explicit responsibilities rather than accidental work for the last agent

Non-goals:

- Implementing product features, changing package boundaries, or approving the open brainstorming epics
- Assigning a permanent agent or model to each package
- Building an orchestration platform, automatic task generator, or new issue taxonomy
- Requiring every small edit to carry an architectural dossier

## Decisions

### 1. A context owns meaning; a slice owns a deliverable

A context has a vocabulary, invariants, and contracts it owns.
A slice is the smallest reviewable behavior change that can be verified against those contracts.
Packages are current implementation locations; they are not automatically the right unit of parallel work.
A context may span locations, and a user experience may involve several contexts.
Use the canonical package map for locations and a change's design for the affected semantic boundaries.

Each affected context receives a compact contract section in its owning design:

| Field               | Required content                                                                             |
| :------------------ | :------------------------------------------------------------------------------------------- |
| Purpose             | The user-visible capability and terms this context owns                                      |
| Boundary            | Owned behavior and explicit exclusions; current code locations linked from the canonical map |
| Provided contracts  | Public operations, types, events, or plugin interfaces, with authoritative requirement links |
| Consumed contracts  | Other contexts' interfaces, their revisions, and assumptions                                 |
| Invariants          | Write/read paths, historical/concurrent behavior, and enforcement relevant to this context   |
| Observable examples | Success, denial/failure, and boundary cases where applicable                                 |
| Change owner        | A named integration/review responsibility for public contract changes                        |
| Status              | Current, approved but unimplemented, or exploratory, with approval evidence                  |

These sections describe only the change's affected surface.
They link existing schemas and specifications rather than inventing duplicate definitions.
For example, storage implements the existing `EventLogStore` contract; a protocol adapter does not independently define graph mutation semantics.

### 2. Preparation removes architectural guessing

Before an implementation assignment exists, the planner resolves the behavior the worker must implement and obtains design approval.
An unresolved choice about graph identity, projection meaning, renderer authority, or conflict resolution is design work, not a worker's implementation detail.
Read-only discovery and design review can proceed while approval is pending.

The design names proposed delivery boundaries without creating `tasks.md` or child implementation beads.
After approval, the integration owner turns those boundaries into Beads tasks with exact OpenSpec scenario references and real prerequisite edges.
`bd ready` is necessary but insufficient: the dispatcher also checks approval, dependency completion, workspace isolation, and packet completeness.
Workers claim only an approved task using `bd update <id> --claim`.
That command applies only to workers with access to the authoritative shared Beads database.
For a remote worker such as Jules, the local dispatcher claims the approved task and supplies the complete packet in the authorized prompt; the remote worker does not rely on a copied database for ownership or update local issue status.
The dispatcher reconciles the remote result with the authoritative issue after review.
The packet states which of these two claim modes applies.

Existing generated propose/apply instructions and the stock OpenSpec schema can progress to tasks based on artifact presence alone.
The structural validator does not enforce maintainer approval.
Root repository instructions remain authoritative, and dispatch must remain a manual approval check until the workflow integration under `canopy-egu` covers generated skills, command counterparts, and relevant Jules prompts.
Passing `openspec validate` must never be presented as approval or implementation readiness.

### 3. Every assignment has a small execution packet

Use the [handoff template](handoff-template.md) as a field contract, not a second task tracker.
The instantiated packet lives in the Beads task, linking its design and specifications.
Do not keep independent progress checklists in the template or design.

The packet pins a base commit and the approved contract revision.
It names files/directories the worker may edit, shared files reserved for integration, the exact outcome, and non-goals.
It maps acceptance scenarios to evidence and gives verified commands from the repository's task definitions or package scripts.
A placeholder command or missing acceptance oracle makes the packet unready.
Small mechanical work can express this in a few sentences; higher-risk changes need explicit boundary examples.

The packet also names the integration owner and review route.
Every worker is told that others may be editing the repository and that it must not revert their changes.
An isolated worktree or sandbox is preferred; if isolation cannot be established, limit the worker to a read-only scout until ownership is resolved.
Concurrency is allowed only for non-overlapping write scopes on compatible, pinned contracts.

### 4. Coupled work has one owner before fan-out

Changes that alter shared exports, generated interfaces, workspace manifests, or several coupled imports need one integration owner.
That owner establishes a building contract baseline before assigning independent consumer updates or tests.
Shared generated artifacts and lockfiles have one writer.
If an atomic change cannot produce a useful intermediate baseline, keep it as one bounded integration slice rather than claiming artificial parallelism.

After that baseline, workers can refine internals independently as long as contract scenarios still pass.
Independent development does not require a new package, an API version for every refactor, or separate services.
The [extraction design](../extract-plugin-host/design.md) is an example of coupled production movement that must precede disjoint follow-up work.

### 5. Contract changes return to the owner

When a worker needs an unapproved contract change, it stops the dependent portion and reports the exact mismatch, affected scenario, and minimal options.
It may continue unrelated work inside its assigned scope only if the results remain useful under either decision.
It must not update snapshots, weaken tests, broaden permissions, or add compatibility layers merely to make its patch pass.

The contract owner identifies affected producers and consumers and classifies the change:

- Internal compatible change: proceed with the existing approved contract and evidence
- Missing or contradictory contract: return to design review and record the decision in the owning OpenSpec change
- Observable incompatible change: update the design and affected scenarios, repeat relevant adversarial review, and obtain approval before dispatching dependent implementation

The integration owner updates or withdraws affected Beads packets and reschedules only the work that depends on the changed contract.
An agent must re-check the pinned contract and task instructions before handoff; stale work is reviewed against the new contract before integration.
Material contract or integration-baseline changes invalidate the affected prior acceptance evidence and reviewer approval.
Re-run affected scenarios and obtain independent review against the resulting revision; unaffected evidence may be retained with an explicit rationale.
Unrelated contexts remain available for work.

### 6. Completion means behavior demonstrated at the boundary

Tests should exercise observable contracts, including a failure or denial path when the change crosses a security or persistence boundary.
Use existing conformance tests where available.
A stub-only success test does not prove serialization, transport, worker isolation, or persistent behavior at the real boundary.
Reference the existing [clip-host boundary constraints](../../../apps/clip-host/AGENTS.md) and relevant integration suites when preparing those assignments.

The worker reports commit/base identity, changed files, scenario evidence, exact checks and outcomes, and unresolved risks.
An independent reviewer compares the patch with approved requirements and checks for boundary violations, test weakening, and unclaimed behavior.
The integration owner owns reconciliation, integrated verification, and acceptance.
Run build before lint on fresh checkouts, the applicable integration/performance checks, and the full `mise run check` gate before landing implementation.
Worker success alone does not close the issue or authorize publication; repository and session merge/close rules still apply.

## Three experience traces

These traces identify review seams; they are not implementation tasks or newly approved domain contracts.

| Experience                                 | Existing foundation                                                                                                                                                           | Independent refinement once contracts are approved                                                                               | Design blocker                                                                                                               |
| :----------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| Custom type with a graph-defined WASM view | [Type authoring](../../specs/type-authoring/spec.md), [view resolution](../../specs/view-rendering/spec.md), [plugin execution](../../specs/content-rendering-plugin/spec.md) | Type/view definition operations, host execution, and application presentation can be verified against their respective contracts | Reconcile declared versus effective-granted renderer capability wording before dependent security work                       |
| Agent proposes knowledge for approval      | [Graph access](../../specs/graph-api-access/spec.md), [draft sessions](../../specs/draft-session/spec.md)                                                                     | Protocol mapping and review presentation can consume an approved staging contract                                                | Agent graph versus draft/projection, interception point, and publication authority remain unresolved                         |
| Two devices edit and inspect history       | [Graph session](../../specs/graph-session/spec.md), [event-log persistence](../../specs/event-log-persistence/spec.md)                                                        | A storage transport can be refined against the agreed event-log port without defining new merge semantics                        | Reconcile revision-token distinctness and define relevant conflict/time-travel dimensions before new cross-device guarantees |

Start the pilot with a genuinely approved, bounded behavior from existing work, selected by the integration owner after a readiness check.
Do not use an unresolved epic as a test of whether an agent can guess the intended architecture.

## Adversarial review and mitigations

Maintainer approval is pending.
Independent read-only review completed with three findings: task staging was not explicitly gated in the normative spec, publication authority lacked a packet field, and superseded contracts did not explicitly invalidate prior evidence.
The revised requirements gate staging as well as dispatch, require action-by-action authority, and require affected checks and independent review to be renewed against the resulting revision.
Discovery also identified remote Beads ownership and artifact-only approval checks; the design now distinguishes dispatcher versus worker claim modes and explicitly rejects structural validation as approval evidence.
These revisions address the review findings; they do not constitute maintainer approval.

| Risk category                        | Failure                                                                      | Mitigation and review evidence                                                                                                                        |
| :----------------------------------- | :--------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource and performance overhead    | Planning packets cost more than the small changes they describe              | Reuse linked contracts, scale packet length to risk, and pilot one slice before introducing automation or broader rollout                             |
| Resource and performance overhead    | Parallel builds overwhelm the environment or shared caches distort results   | Integration owner limits active workers to available isolation and capacity; evidence records environment and performance checks use uncontended runs |
| Failure modes and edge cases         | Workers read different contract revisions                                    | Pin design/base revisions, re-check at handoff, and withdraw affected packets when contracts change                                                   |
| Failure modes and edge cases         | Green unit tests conceal broken integration                                  | Require boundary scenarios and independent integrated verification; assign ownership of the user-visible outcome                                      |
| Failure modes and edge cases         | Cross-cutting changes are divided into individually broken patches           | Keep coupled changes with one owner until a building contract baseline exists                                                                         |
| Failure modes and edge cases         | A ready Bead is mistaken for approval                                        | Dispatcher checks merged design evidence, requirements, ownership, dependencies, and isolation in addition to `bd ready`                              |
| Security and isolation               | Agent or plugin work bypasses enforcement to satisfy a test                  | Pin denial scenarios and security contracts; independent review rejects weakened grants or bypasses                                                   |
| Security and isolation               | Concurrent agents overwrite user changes or publish without authority        | Isolated scopes, single shared-file writer, explicit handoff and publication authority; root inspects results                                         |
| Migration and backward compatibility | Protocol rollout rewrites old approved tasks or imposes new runtime behavior | Pilot on one newly prepared task, retain older designs as history, and revise existing packets only through their owner                               |
| Migration and backward compatibility | A package extraction is assumed landed because its design was approved       | Record current versus approved ownership separately and pin the actual implementation baseline before dispatch                                        |
| Migration and backward compatibility | Skill regeneration discards project conventions                              | Keep canonical guidance in project-owned files and verify generated-tool instructions include context during the existing skills update work          |

## Adoption and rollback

This PR contains proposal, design, specification, and a blank handoff template only.
After design approval, the existing `canopy-egu` work can stage bounded adoption tasks for project guidance and a single pilot.
The pilot is accepted only when a worker and independent reviewer can complete one approved slice using the packet without inventing a contract, and integrated checks pass.
Record ambiguities discovered by the pilot and refine this protocol before wider use.
If the packet adds unnecessary overhead, simplify its presentation while preserving approval, ownership, contract, and evidence requirements.
No application data migration or runtime rollback is involved.

## Open questions

- Which approved slice provides the smallest representative pilot at dispatch time?
- Which packet fields repeatedly need mechanical validation after the pilot, if any?
- Which existing generated-skill update mechanism should carry the approved project guidance without maintaining divergent copies?

These questions block broad rollout or automation, not review of this proposed contract.
