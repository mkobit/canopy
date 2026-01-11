# @canopy/types

## Package purpose

This package contains all foundational TypeScript types for the Canopy graph system.
It has zero runtime code and zero dependencies.

## Code navigation

Types are organized by domain concept in separate files:

- `identifiers.ts`: branded types for NodeId, EdgeId, TypeId, GraphId.
- `temporal.ts`: Instant and PlainDate aligned with TC39 Temporal, plus TemporalMetadata.
- `scalars.ts`: scalar value types (text, number, boolean, temporal, references).
- `properties.ts`: PropertyValue union, ListValue, PropertyDefinition, PropertyMap.
- `node.ts`: Node interface.
- `edge.ts`: Edge interface.
- `meta.ts`: NodeTypeDefinition and EdgeTypeDefinition for meta-circular type system.
- `graph.ts`: Graph aggregate root and QueryResult.

All public types are re-exported from `index.ts`.

## Architectural invariants

1. No runtime code—only type definitions using `export type`.
2. All properties are `readonly`.
3. All arrays are `readonly T[]`.
4. All maps are `ReadonlyMap<K, V>`.
5. Branded types use `unique symbol` to prevent mixing identifiers.
6. Optional properties use explicit `| undefined`, not `?` syntax.
7. No dependencies on any other package.
8. Property values are flat—ListValue contains only ScalarValue, no nesting.
9. Edges connect nodes within the same graph—cross-graph references use ExternalReferenceValue.
10. Temporal types align with TC39 Temporal naming conventions.

## Dependencies

None.
This package must remain dependency-free.

## Testing approach

This package has no runtime tests because it contains no runtime code.
Type correctness is verified by the TypeScript compiler during build.
