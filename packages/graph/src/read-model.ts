import type { NodeId, TypeId } from './identifiers';
import type { PropertyValue } from './properties';
import type { QueryResult } from './graph';
import type { Result } from './result';

/** Direction of edge traversal relative to a node. */
export type EdgeDirection = 'out' | 'in' | 'both';

/**
 * Sentinel a read-model backend returns from `tryExecutePipeline` when it cannot answer a given
 * pipeline, so the caller falls back to composing the primitives below (or a full scan).
 */
export const READ_MODEL_NOT_COVERED = Symbol('read-model-not-covered');
export type ReadModelNotCovered = typeof READ_MODEL_NOT_COVERED;

/**
 * Index-shaped read access to a graph, so callers can avoid scanning `graph.nodes`/`graph.edges`
 * directly. Defined in `@canopy/graph` (invariant 1: dependency-free leaf) so any downstream
 * package -- the query executor today, a native/SQL backend later -- can consume or implement it
 * without `@canopy/graph` depending on them. `TPipeline` is left generic (default `never`) so the
 * kernel never needs to know the shape of a query pipeline defined elsewhere (e.g. `@canopy/queries`).
 */
export interface ReadModelPort<TPipeline = never> {
  /** All node IDs of the given type. */
  readonly typedNodeIds: (type: TypeId) => Iterable<NodeId>;
  /** Node IDs connected to `nodeId` by edges of `edgeType` (or any type, if undefined) in `direction`. */
  readonly neighbours: (
    nodeId: NodeId,
    edgeType: TypeId | undefined,
    direction: EdgeDirection,
  ) => Iterable<NodeId>;
  /**
   * Node IDs (optionally narrowed to `type`) whose `property` equals `value`.
   * Scalar equality only -- array-valued properties are never indexed here, matching the
   * executor's own `eq` filter semantics (strict equality, meaningless for arrays by reference).
   */
  readonly nodesWhereEquals: (
    property: string,
    value: PropertyValue,
    type?: TypeId,
  ) => Iterable<NodeId>;
  /**
   * Optional whole-pipeline push-down hook. A backend that can execute an entire query pipeline
   * natively implements this to bypass step-by-step interpretation; returns
   * `READ_MODEL_NOT_COVERED` for any pipeline it cannot answer, so the caller falls back to the
   * primitives above (or a full scan).
   */
  readonly tryExecutePipeline?: (
    pipeline: TPipeline,
  ) => Result<QueryResult, Error> | ReadModelNotCovered;
}
