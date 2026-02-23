# @canopy/query

## Architectural Invariants

Query execution is read-only and does not modify the graph.
The implementation should be isolated to allow future replacement with ISO GQL.
