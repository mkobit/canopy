# Bounded slice handoff

Status: blank design template; not a task and not permission to implement.
After design approval, place a completed packet in its Beads task and replace every placeholder.

## Authority and outcome

- Bead: `<approved task ID>`
- Outcome: `<one observable behavior>`
- Approved design: `<path, revision, merged approval PR>`
- Requirements: `<exact requirement and scenario links>`
- Base commit and prerequisites: `<commit and completed prerequisite IDs>`
- Integration owner and reviewer: `<assigned responsibilities>`
- Claim mode: `<worker claims authoritative local Bead, or dispatcher claims and sends remote packet>`
- Action authority: `<state who may update issues, commit, push, create a PR, merge, and close; never infer permission>`

## Context and boundaries

- Read: `<core tenets, applicable AGENTS.md, relevant context contracts>`
- Provided/consumed contracts: `<links and pinned revisions>`
- Owned files: `<exact files or bounded directories>`
- Reserved shared files: `<integration owner's files>`
- Non-goals: `<adjacent behavior excluded from this slice>`
- Isolation: `<worktree or sandbox and any shared mutable resources>`

You are not alone in the codebase.
Preserve other contributors' changes and report conflicts to the integration owner.
In local claim mode, claim the approved task atomically with `bd update <id> --claim` before implementation.
In remote mode, the dispatcher claims the authoritative Bead and supplies this packet; do not claim or update a copied database.

## Acceptance evidence

| Scenario                                            | Observable expected result | Verification command or review evidence       |
| :-------------------------------------------------- | :------------------------- | :-------------------------------------------- |
| `<success>`                                         | `<expected result>`        | `<verified command>`                          |
| `<failure, denial, or boundary case if applicable>` | `<expected result>`        | `<verified command or reason not applicable>` |

Required checks: `<verified scoped commands, integration/performance checks, and full-gate ownership>`.
Run build before lint when the checkout lacks built declarations.

## Escalation and return

Stop dependent work if the approved contract is contradictory, a required prerequisite is absent, or a change outside the owned scope is necessary.
Report the precise mismatch and affected scenario; do not invent domain semantics or weaken checks.
Return the commit and base revision, changed files, scenario evidence, command outcomes, and remaining concerns.
Re-check task instructions and contract revisions before handoff.
If the contract or integration baseline materially changes, renew affected scenario evidence and independent review against the resulting revision.
Publication, integration, and issue closure follow the assigned authority and repository rules.

## Example of scope granularity

This hypothetical example demonstrates packet size and evidence; it is not an approved task or an executable assignment.
Actual dispatch must replace the fictional revision and file locations with verified values.

Outcome: a query adapter preserves the domain's existing missing-node result instead of translating it to success.
Contract: an already-approved query requirement defines the missing-node result; this assignment cannot change it.
Base and dependency: the integration owner supplies the passing commit that exports that result type.
Ownership: one named adapter mapping function and its existing conformance test file; domain operations, generated schemas, and public barrels are reserved.
Acceptance: a known node still succeeds, and a missing node produces the approved protocol error without committing any graph event.
Evidence: the owner supplies verified focused-test commands and a real adapter invocation for both cases; stubbing the mapping alone is insufficient.
Escalation: if the protocol has no approved mapping for the domain error, return that contract question rather than choose a new error representation.
Handoff: return the patch, base revision, both scenario results, and check output for independent review.
Authority: in this example the worker returns a patch only; the integration owner handles Beads updates, commits, publication, and closure through the repository's normal approval route.
