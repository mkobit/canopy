## Why

The view-rendering specification selects WASM rendering tiers from declarations, contradicting the approved effective-grant rule in content-rendering-plugin.
The latter also retains a universal static-only execution ceiling from before Tier 2.
Inconsistent `Renderer` and `RendererDefinition` terminology obscures which graph entity these contracts describe.
These contradictions make later bounded assignments unsafe even though the underlying tier decision is already settled.

## What changes

- Reconcile dispatch with the existing explicit interactive-grant rule, including wildcard non-conveyance.
- Scope the historical `render:raw-html` ceiling to the bundled first-party static Markdown renderer rather than all WASM rendering.
- Use `Renderer` for the graph-resident definition and explain historical `RendererDefinition` wording without renaming stored types or identifiers.
- Record current and approved future ownership, observable scenarios, and unresolved runtime gaps in the design.
- Specify the maintainer-selected fail-closed outcome when an authorized interactive renderer's worker guest cannot resolve or load: a host-owned unavailable indication, without alternate guest execution.

This is a design-only reconciliation proposal, pending maintainer review.
It does not implement runtime repairs or a grant-management system.
View-dependent fallback alternatives remain later UX/model research; cache-context questions remain outside the proposed normative delta until resolved with the maintainer.

## Capabilities

### New capabilities

None.

### Modified capabilities

- `view-rendering`: clarify the existing renderer identity and effective-grant dispatch contract.
- `content-rendering-plugin`: align execution terminology and scope with the approved Tier-2 requirements.

## Impact

Only this proposal's OpenSpec artifacts change.
Existing normative specifications and archived designs remain intact pending review.
The [design](design.md) links merged approval history and maps graph, queries/settings, application rendering, shared access, host execution, and transport responsibilities.
The approved [plugin-host extraction](../extract-plugin-host/design.md) remains behavior-preserving and unimplemented; this proposal does not amend its assignments.
No implementation tasks, dispatch, schema migration, generated instructions, data migration, or new package are included.
