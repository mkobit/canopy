# Cadence domain content type

## Context

Bead `canopy-ayv`.
This is the second dogfood of the type-authoring control plane, after `canopy-goi` (Task/Project/Person, PR #353).
It is also the concrete second domain type that resolves `canopy-6cz` — whether a domain concept should get its own namespace instead of sharing `content` — with real evidence instead of speculation.

The core concept is a generic recurring-trigger mechanism, not a Pomodoro-specific feature.
A Pomodoro timer is one use case of it; another is re-running a saved `QueryDefinition` on a schedule.
The full "everything is a node" data model — individual phases and actions as first-class, independently queryable nodes — is still being validated separately in the user's Obsidian vault, via a parallel Obsidian plugin.
This design deliberately stays minimal until that validation lands; evolving the type later is cheap because NodeType/EdgeType definitions in this system are create-only (evolving a type means creating a new one, not editing in place).

## Data model

All of the following are authored at runtime through the Schema UI, the same way `canopy-goi` authored Task/Project/Person — none of it is hardcoded in `bootstrap.ts`.

**Namespace:** `cadence` (kind: `user`), deliberately separate from `content`.

**NodeTypes** (in `cadence`):

- **Cadence** — `name` (text, required, inline), `rrule` (text, required, inline — an RRULE string, e.g. `FREQ=DAILY;COUNT=4`; RRULE-in-a-property is the same convention Obsidian's TaskNotes plugin uses for recurrence), `phases` (text, required, inline — a JSON-encoded ordered list of `{name, minutes}`, e.g. Pomodoro's classic `[{"name":"work","minutes":25},{"name":"break","minutes":5}]` repeated with a longer break every fourth cycle).
- **CadenceAction** — `actionKind` (text, required, inline — free-form, e.g. `"rerun-query"` or `"notify"`; deliberately not a closed enum, same precedent as `Namespace.kind` from `canopy-9zj`, so new action kinds never need a schema change), `target` (reference, optional, inline — a NodeId pointing at whatever gets acted on, e.g. a saved `QueryDefinition`), `description` (text, optional, inline).

Phases stay a single opaque JSON-string property on `Cadence` rather than their own NodeType — the same convention `NodeType.properties` itself already uses internally for its property list, so no new machinery is needed.
This is the "minimal" model, not the "fully exploded" one where each phase and action would be an independently queryable node; that richer model is deferred pending the Obsidian vault validation mentioned above.

**EdgeTypes** (in `cadence`):

- `triggers` — `sourceTypes: [Cadence]`, `targetTypes: [CadenceAction]`.

Only one EdgeType, matching the minimal-scope decision — `CadenceAction.target` carries the actual pointer to whatever gets acted on as a plain `reference`-kind property value, not a second EdgeType.

## Verification

New file `apps/web/e2e/cadence.e2e.ts` — mirrors `domain-content-types.e2e.ts`'s structure, including its per-phase helper-function pattern (`createAndOpenGraph`, a namespace/PropertyType-equivalent step, `createNodeTypes`, `createEdgeTypes`, an instantiation step, `cleanUpGraph`) to stay under the same `max-lines-per-function`/`functional/no-let` lint constraints that shaped that file's final form.
This test:

1. Creates a fresh graph and opens it.
2. Navigates to the Schema section and creates the `cadence` namespace.
3. Creates the `Cadence` and `CadenceAction` NodeTypes as specified above.
4. Creates the `triggers` EdgeType with its source/target checkboxes set.
5. Opens the "New Node" dialog, creates a real `Cadence` instance (with a concrete `rrule` and `phases` JSON string), then creates a real `CadenceAction` instance whose `target` property is filled in with the `Cadence` node's own ID (extracted from its detail-page URL, same pattern `domain-content-types.e2e.ts` uses to capture a freshly-created node's ID) — this proves the `reference` `PropertyValueKind` is usable end-to-end via the New Node dialog, which no prior e2e test has exercised (`canopy-goi`'s `status` property used `text`, not `reference`).
6. Deletes the test graph.

Step 5's `target` value is a placeholder pointer (the `Cadence` node's own ID), not a real `QueryDefinition` — see "Out of scope" below.

## Out of scope

- **Phase-by-phase execution or timer behavior.** No scheduler/execution engine exists in this system yet (per project status: "Not done: ... workflow execution"). This is data modeling only, the same boundary `canopy-goi` drew around Task/Project/Person (no execution semantics, just a usable shape).
- **The "fully exploded" per-phase/per-action-node model.** Deferred pending validation of the UX and data model in the user's Obsidian vault, via a parallel Obsidian plugin being built to prove this out first. Revisit `canopy-6cz` and this design together once that validation lands.
- **Wiring `CadenceAction.target` to a real `QueryDefinition` instance.** `QueryDefinition` lives in the restricted `system` namespace and has no UI path to instantiate today (the same restriction Task 1 of `canopy-goi` encoded into `listAllowedNodeTypes`) — there is no real saved query to point at yet. The e2e test proves the `reference` property mechanism generically instead.
