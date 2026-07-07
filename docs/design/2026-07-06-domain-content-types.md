# Domain content types: Task/Project/Person

## Context

Bead `canopy-goi`.
This is the explicit follow-on called out in the `type-creation-control-plane` proposal (`openspec/changes/archive/2026-07-03-type-creation-control-plane/proposal.md`): "Domain content types (Task/Project/Person) are an explicit follow-on, created by dogfooding this control plane's UI once it exists — not part of this change."
Hardcoding Task/Project/Person into `packages/graph/src/bootstrap.ts` (the way `TextBlock`/`CodeBlock`/`MarkdownNode` are seeded) was explicitly rejected during that earlier brainstorm.
The goal here is to prove the type-authoring control plane (`createNamespace`/`createNodeType`/`createEdgeType`/`createPropertyType`, and the Schema UI in `apps/web`) on a real, non-trivial modeling case, and to leave a permanent, re-runnable proof that it works — not to produce a lasting seed of these types in every graph.

## Data model

All of the following are authored at runtime through the Schema UI; none of it is hardcoded in `bootstrap.ts` and none of it is auto-seeded into new graphs.

**Namespace:** `content` (kind: `user`).

**PropertyTypes** (in `content`):
- `status` — `text`. Shared, referenced by both `Task` and `Project`. Deliberately `text`, not `reference` — a status is a plain string, not a pointer to another node.

**NodeTypes** (in `content`):
- **Person** — `name` (text, required, inline), `email` (text, optional, inline).
- **Project** — `name` (text, required, inline), `status` (optional, referencing the `status` PropertyType), `description` (text, optional, inline).
- **Task** — `title` (text, required, inline), `status` (optional, referencing the `status` PropertyType), `priority` (number, optional, inline), `dueDate` (plain-date, optional, inline), `description` (text, optional, inline).

Note the two different senses of "reference" in this system: `status` here uses a `TypePropertyInput` of `kind: 'reference'`, meaning the property's *shape* is looked up from the `status` PropertyType node — the resulting value kind is still `text`, resolved to a concrete inline `PropertyDefinition` at NodeType-creation time.
That's distinct from `PropertyValueKind`'s `'reference'` (a value that is itself a `NodeId`), which none of these properties use.

**EdgeTypes** (in `content`):
- `belongs_to` — `sourceTypes: [Task]`, `targetTypes: [Project]`. Named generically (not `belongs_to_project`) since these hint lists are create-only/immutable and only ever advisory (see below) — a narrow name would misrepresent a relationship that may get reused for other pairs later.
- `assigned_to` — `sourceTypes: [Task]`, `targetTypes: [Person]`.

`sourceTypes`/`targetTypes` on both EdgeTypes are advisory metadata only.
`isEdgeCompatible` (`packages/graph/src/validation.ts:278-286`) never hard-rejects an edge that violates them — this matches the event-sourced/eventually-consistent model, where a concurrent write elsewhere shouldn't be hard-blocked by a locally-stale view of the schema.

## Verification

New file `apps/web/e2e/domain-content-types.e2e.ts` — deliberately separate from the existing `apps/web/e2e/schema.e2e.ts`, which already uses "Task"/"Project" as disposable, unrelated fixture names for testing the control plane's mechanics.
This test:

1. Creates a fresh graph and opens it.
2. Navigates to the Schema section and creates the `content` namespace.
3. Creates the `status` PropertyType.
4. Creates the `Person`, `Project`, and `Task` NodeTypes as specified above (adding one inline property at a time, then referencing `status` via the "Reference PropertyType" control already proven in `schema.e2e.ts`).
5. Creates the `belongs_to` and `assigned_to` EdgeTypes with their source/target checkboxes set.
6. Opens the "New Node" dialog, selects `Task`, fills in `title`, confirms the other Task properties render with the expected input kinds, submits, and asserts navigation to the node detail page.
7. Deletes the test graph.

Step 6 is the important addition over a pure schema-authoring test: it proves the NodeType is actually usable for creating a real node instance, not just definable.

## Out of scope

- **Edge instances.** Actually linking a real Task to a real Project/Person goes through a separate, unrelated UI path (`InteractiveGraphView`'s drag-connect plus a raw `prompt()` for the edge-type name, `apps/web/src/components/graph/interactive-graph-view.tsx`), not the type-authoring control plane this bead is validating.
- **Renderer wiring.** Task/Project/Person nodes will render through the same generic property-list view every node type uses today — there is no NodeType → Renderer dispatch anywhere in `apps/web` yet, even though the `Renderer` NodeType and scoped `default-renderer` setting already exist in `bootstrap.ts`. Filed as `canopy-hqq`, explicitly deferred pending a concrete real need.
- **EdgeType semantic reuse / plugin aliasing.** As more domain NodeTypes get added, naming one narrow EdgeType per source/target pair doesn't scale, and a further question is how plugin-contributed types (once a plugin host exists) could alias onto core queryable relationships. Filed as `canopy-eqd`, explicitly deferred pending more real EdgeTypes to battle-test against — not designed here.
