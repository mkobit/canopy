## 1. Data Model & Schema Extension

- [ ] 1.1 Extend `PropertyDefinition` in `packages/graph/src/properties.ts` with `cardinality?: 'one' | 'many'` and `targetTypeId?: TypeId`.
- [ ] 1.2 Update `PropertyDefinitionSchema` in `packages/graph/src/schemas.ts` to validate optional `cardinality` and `targetTypeId`.
- [ ] 1.3 Update `propertyTypeProperties` metatype definition in `packages/graph/src/bootstrap-definitions.ts` to include metadata properties for `cardinality`, `choices`, `targetTypeId`, `regex`, `min`, and `max`.

## 2. Validation Engine Enhancements

- [ ] 2.1 Update `validateValue` and `validateChoices` in `packages/graph/src/validation.ts` to enforce `cardinality` ('one' vs 'many') and element-wise enum choices.
- [ ] 2.2 Add typed-reference target-type validation (`targetTypeId`) in `packages/graph/src/validation.ts` by looking up referenced nodes in `graph.nodes`.
- [ ] 2.3 Update `validatePropertyByType` in `packages/graph/src/validation.ts` to extract constraint properties from `PropertyType` nodes and enforce them.

## 3. Type Authoring Operations

- [ ] 3.1 Update `createPropertyType` in `packages/graph/src/ops/type-authoring.ts` to accept optional constraint parameters (`cardinality`, `choices`, `targetTypeId`, `regex`, `min`, `max`) and serialize them onto created `PropertyType` nodes.

## 4. Testing & Verification

- [ ] 4.1 Add test suite in `packages/graph/src/validation.test.ts` covering cardinality, closed-values choices, and typed references.
- [ ] 4.2 Add test suite in `packages/graph/src/ops/type-authoring.test.ts` for authoring constrained `PropertyType` nodes.
- [ ] 4.3 Execute full quality gates: `bun run build`, `bun run lint`, `bun run typecheck`, `bun test`.
