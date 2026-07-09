# QueryDefinition instantiation UI path

## Context

Bead `canopy-2qu`.
There is currently no UI path to instantiate `QueryDefinition` nodes, which live in the restricted `system` namespace.
This prevents pointing reference-kind properties like `CadenceAction.target` at real saved queries in end-to-end tests.
By making `QueryDefinition` instantiable, we can test reference property verification end-to-end.

## Data model

No changes are made to the schema or data model.
The `QueryDefinition` node type is already defined in `packages/graph/src/system.ts` and bootstrapped in `packages/graph/src/bootstrap.ts`.
This change simply adds `SYSTEM_IDS.QUERY_DEFINITION_DEF` to the list of allowed node types in `apps/web/src/utils/node-types.ts`.
This exposes `QueryDefinition` in the "New Node" dialog.

## Verification

We will create a new end-to-end test under `apps/web/e2e/query-definition.e2e.ts`.
This test will perform the following actions:

1. Create a fresh graph and open it.
2. Navigate to the Schema section and create a new user namespace called `cadence`.
3. Create the `CadenceAction` NodeType with a `reference`-kind property called `target`.
4. Open the "New Node" dialog, select the "Query Definition" type, fill out its properties, and create a real `QueryDefinition` instance.
5. Extract the created `QueryDefinition` node ID from the URL.
6. Open the "New Node" dialog again, select the `CadenceAction` type, fill out `actionKind`, and set its `target` to the extracted `QueryDefinition` node ID.
7. Verify that the created `CadenceAction` node successfully holds the target `QueryDefinition` node ID in its raw node data view.
8. Deletes the test graph.

## Out of scope

- Re-running queries automatically or scheduler/execution behavior (workflow execution).
- A rich query builder UI or syntax highlighting for the JSON query definition field.
- Creating other system-namespace node types that are not meant for manual instantiating.
