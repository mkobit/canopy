export declare const nodeIdBrand: unique symbol
export declare const edgeIdBrand: unique symbol
export declare const typeIdBrand: unique symbol
export declare const graphIdBrand: unique symbol

/**
 * Unique identifier for a node within a graph.
 */
export type NodeId = string & { readonly [nodeIdBrand]: never }

/**
 * Unique identifier for an edge within a graph.
 */
export type EdgeId = string & { readonly [edgeIdBrand]: never }

/**
 * Unique identifier for a node or edge type definition.
 */
export type TypeId = string & { readonly [typeIdBrand]: never }

/**
 * Unique identifier for a graph (aggregate root).
 */
export type GraphId = string & { readonly [graphIdBrand]: never }
