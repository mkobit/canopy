import type { Node } from './node';

/**
 * A stored query definition in the graph.
 * This corresponds to a node with type `system:nodetype:query-definition`.
 */
export interface QueryNode extends Node {
  // This interface serves as a marker/documentation for now,
  // as the actual properties are stored in the `properties` map.
  // We might add helper methods or property accessors in a wrapper class later.
}
