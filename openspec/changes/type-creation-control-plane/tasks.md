## 1. Namespace and PropertyType metatypes

- [ ] 1.1 Add `NAMESPACE_DEF`/`NAMESPACE` and `PROPERTY_TYPE_DEF`/`PROPERTY_TYPE` entries to `packages/graph/src/system.ts`, following the existing self-describing `NODE_TYPE`/`EDGE_TYPE` pattern
- [ ] 1.2 Define the `Namespace` node shape (`name`, `description`, `kind`) and `PropertyType` node shape (`name`, `valueKind`, `description`) as NodeType definitions in bootstrap, validated by the existing `validateNode`/`extractNodeTypeDefinition` machinery
- [ ] 1.3 Add `RESTRICTED_NAMESPACE_KINDS` (initially `{"system"}`) to `packages/graph/src/namespace.ts`

## 2. Bootstrap migration

- [ ] 2.1 Add a bootstrap migration step emitting `NodeCreated` events for 4 `Namespace` nodes: `system` (kind: `"system"`), `user`, `imported`, `user-settings` (non-restricted kind), tagged with migration metadata per the existing bootstrap convention
- [ ] 2.2 Audit all call sites in `namespace.ts`, `resolve-namespace.ts`, and any cross-package usage (`@canopy/settings`, `@canopy/storage`) that reference the 4 namespace strings, confirming none special-case the literal union type itself (only the string values)
- [ ] 2.3 Rewrite namespace validity checks in `validation.ts`/`resolve-namespace.ts` to look up a non-deleted `Namespace` node by `name`, replacing the old 4-literal enum check
- [ ] 2.4 Remove the old closed `Namespace` string-union type once nothing references it

## 3. Type-authoring ops

- [ ] 3.1 Implement `createNamespace(graph, input)` in `packages/graph/src/ops/`: rejects duplicate `name`, rejects `kind: "system"` (or any kind in `RESTRICTED_NAMESPACE_KINDS`)
- [ ] 3.2 Implement `createNodeType(graph, input)`: resolves `namespace` against an existing `Namespace` node, rejects restricted-kind targets, accepts mixed inline/referenced `properties` list
- [ ] 3.3 Implement `createEdgeType(graph, input)`: same namespace/restriction check, `sourceTypes`/`targetTypes` stored as best-effort metadata only
- [ ] 3.4 Implement `createPropertyType(graph, input)`: validates `valueKind` against `PropertyValueKind`, wires into existing `validatePropertyByType` (`validation.ts:241`)
- [ ] 3.5 Unit tests for all 4 ops: success path, duplicate-name rejection, restricted-namespace rejection, malformed property lists

## 4. Bootstrap and validation tests

- [ ] 4.1 Unit tests asserting the 4 migrated namespaces resolve correctly post-migration
- [ ] 4.2 Unit tests for the rewritten namespace validity check (valid name, unknown name, deleted `Namespace` node)

## 5. Schema UI

- [ ] 5.1 Add "Schema" section/route to `apps/web`, wired to the existing `GraphProvider` context
- [ ] 5.2 Namespace list view + create form (kind picker excludes restricted kinds)
- [ ] 5.3 Per-namespace NodeType/EdgeType/PropertyType list views
- [ ] 5.4 Shared `PropertyListEditor` component (inline property rows + reference-existing-PropertyType rows), used by both NodeType and EdgeType create forms
- [ ] 5.5 NodeType create form
- [ ] 5.6 EdgeType create form, including optional source/target NodeType multi-selects
- [ ] 5.7 PropertyType create form
- [ ] 5.8 Error handling: surface failed `Result`s (e.g. restricted-namespace rejection) in the UI without creating a definition

## 6. End-to-end verification

- [ ] 6.1 Playwright e2e: create a namespace → create a NodeType in it → create a PropertyType and reference it from a NodeType → verify a restricted-namespace (`system`) create attempt is blocked in the UI, matching the existing e2e pattern from PR #321
- [ ] 6.2 `bun run typecheck` / `bun run lint` / `bun test` clean across all packages
- [ ] 6.3 Update `docs/design/2026-02-06-core-data-model.md` section 10 to mark open question #6 ("Namespace representation") as resolved, pointing at this change
