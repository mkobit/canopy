# Query & view engine

## Overview

This directory provides a functional query pipeline DSL, dual indexed/scan-only query execution engines, a stubbed Cypher adapter, and graph-backed persistence and execution for stored queries and views. All operations return `Result` values and avoid mutating input graphs.

## Interface

- `[index.ts:*]` Re-exports all symbols from `model`, `pipeline`, `engine`, `stored`, `views`, `cypher`, and `query-node`.
- `[model.ts:Operator, Filter, Sort, Traversal, QueryStep, Query, NodeQuery, EdgeQuery]` Query AST types.
- `[pipeline.ts:query, nodes, edges, where, orderBy, limit, traverse, returns, from, to]` Functional query pipeline builders.
- `[engine.ts:executeQuery, executeQueryScanOnly]` Indexed query executor (`createIndexedReadModel`) and scan-only reference oracle.
- `[query-node.ts:QueryNode]` Type alias for `@canopy/graph` `Node`.
- `[cypher.ts:QueryEngine, executeCypherQuery, validateCypherQuery, createCypherQueryEngine]` Basic single-node `MATCH` Cypher adapter and validation stub.
- `[stored.ts:SaveQueryOptions, saveQueryDefinition, getQueryDefinition, listQueryDefinitions, executeStoredQuery]` Persistence, `$param` substitution, and execution for `SYSTEM_IDS.QUERY_DEFINITION` nodes.
- `[views.ts:ViewDefinition, SaveViewOptions, ResolvedView, saveViewDefinition, getViewDefinition, listViewDefinitions, isSystemNode, executeView, resolveView]` Persistence, resolution, and execution for `SYSTEM_IDS.VIEW_DEFINITION` nodes.

## Invariants

- `[engine.ts:executeQuery]` and `[engine.ts:executeQueryScanOnly]` Require `accumulator.isNodeContext === true` for traversal steps (`err` otherwise); `applyFilterIndexed` uses `readModel.nodesWhereEquals` for scalar `'eq'` predicates and re-verifies candidates; `applySort` places `undefined` values last.
- `[cypher.ts:executeCypherQuery]` Executes only single-node `MATCH ([var][:Type]) [RETURN var]` queries and returns `err` for unsupported syntax.
- `[stored.ts:getQueryDefinition]` Requires target node type `SYSTEM_IDS.QUERY_DEFINITION` and valid JSON `'definition'`; `[stored.ts:substituteParameters]` replaces `$param` strings when `Object.hasOwn(parameters, name)`.
- `[views.ts:getViewDefinition]`, `[views.ts:resolveView]`, `[views.ts:executeView]` Require `SYSTEM_IDS.VIEW_DEFINITION` with string `'name'`/`'layout'`, require `queryRef` on resolve, and exclude `isSystemNode(node)` entries from `executeView` results.

## Side Effects

- `[stored.ts:saveQueryDefinition]` and `[views.ts:saveViewDefinition]` Call `createNodeId()` and `createInstant()` and return a new `Graph` without mutating the input graph.

## Verification

- Run: `bun test`
