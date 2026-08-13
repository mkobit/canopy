## Why

`PropertyType` nodes in Canopy currently declare a `valueKind` but lack runtime constraint enforcement for cardinality, closed-value enumerations, and typed reference targets, leaving core-data-model open question 4 unresolved and leaving a feature gap compared to Logseq 2.0's shipped per-property schema validation.
Adding explicit `cardinality` (one/many), `choices` (closed-values / enums), and `targetTypeId` (typed references) to `PropertyType` and `PropertyDefinition` completes per-property schema validation within `@canopy/graph` while preserving Zod schemas as the single source of runtime validation truth.

## What Changes

- **PropertyDefinition Schema Extension**: Extend `PropertyDefinition` in `@canopy/graph` with optional `cardinality` (`'one' | 'many'`), `choices` (`readonly string[]`), and `targetTypeId` (`TypeId`).
- **PropertyType Metatype System Definitions**: Update `propertyTypeProperties` in `bootstrap-definitions.ts` to include metadata properties for `cardinality`, `choices`, `targetTypeId`, `regex`, `min`, and `max`.
- **Runtime Constraint Enforcement in `validation.ts`**:
  - Enforce `cardinality`: single scalar value required for `'one'`, array required for `'many'` (with legacy `valueKind: 'list'` supported as `'many'`).
  - Enforce `choices` (closed-values): validate that values (or elements of `'many'` properties) match the allowed set of string or numeric choices.
  - Enforce `targetTypeId` (typed references): validate that `valueKind: 'reference'` values (or list elements) point to existing nodes in the `Graph` whose `type` matches `targetTypeId`.
- **Type Authoring Ops**: Update `createPropertyType` in `packages/graph/src/ops/type-authoring.ts` to accept optional `cardinality`, `choices`, `targetTypeId`, `regex`, `min`, and `max` arguments, writing them into the created `PropertyType` node properties.
- **Validation Engine Export**: Update `validatePropertyByType` to extract and enforce full constraint checks when validating individual property values against a standalone `PropertyType` definition node.

## Capabilities

### New Capabilities

- `property-constraints`: per-property constraint validation for cardinality (one vs. many), closed-value enum choices, and target node type restrictions on reference properties.

### Modified Capabilities

- `type-authoring`: `createPropertyType` accepts optional constraint parameters (`cardinality`, `choices`, `targetTypeId`, `regex`, `min`, `max`) and persists them onto authored `PropertyType` nodes.

## Impact

- `packages/graph/src/properties.ts`: `PropertyDefinition` type definition update.
- `packages/graph/src/schemas.ts`: `PropertyDefinitionSchema` Zod validation update.
- `packages/graph/src/bootstrap-definitions.ts`: `propertyTypeProperties` system property list update.
- `packages/graph/src/validation.ts`: `validateValue`, `validateProperties`, `validateNode`, and `validatePropertyByType` constraint enforcement.
- `packages/graph/src/ops/type-authoring.ts`: `createPropertyType` parameter and event payload updates.
- `packages/graph/src/ops/type-authoring.test.ts` & `validation.test.ts`: test suite additions for property constraint validation.
