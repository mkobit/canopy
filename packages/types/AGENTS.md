# @canopy/types

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
