export declare const nodeIdBrand: unique symbol;
export declare const edgeIdBrand: unique symbol;
export declare const typeIdBrand: unique symbol;
export declare const graphIdBrand: unique symbol;
export declare const eventIdBrand: unique symbol;
export declare const deviceIdBrand: unique symbol;
export declare const namespaceBrand: unique symbol;
export declare const revisionBrand: unique symbol;

/**
 * Unique identifier for a node within a graph.
 */
export type NodeId = string & Readonly<{ [nodeIdBrand]: never }>;

/**
 * Unique identifier for an edge within a graph.
 */
export type EdgeId = string & Readonly<{ [edgeIdBrand]: never }>;

/**
 * Unique identifier for a node or edge type definition.
 */
export type TypeId = string & Readonly<{ [typeIdBrand]: never }>;

/**
 * Unique identifier for a graph (aggregate root).
 */
export type GraphId = string & Readonly<{ [graphIdBrand]: never }>;

/**
 * Unique identifier for a graph event.
 */
export type EventId = string & Readonly<{ [eventIdBrand]: never }>;

/**
 * Unique identifier for a device originating an event.
 */
export type DeviceId = string & Readonly<{ [deviceIdBrand]: never }>;

/**
 * Name of a logical partition within a graph's identity space.
 * Restricted to URI path-segment characters (RFC 3986 unreserved: ALPHA / DIGIT / "-" / "." / "_" / "~").
 */
export type Namespace = string & Readonly<{ [namespaceBrand]: never }>;

/**
 * Opaque optimistic-concurrency token for a Graph: the running maximum applied
 * EventId, so it is collision-proof under concurrent commits (unlike a
 * wall-clock timestamp) while remaining a totally-ordered, comparable string.
 * See DraftSession.commit / getParentRevision.
 */
export type Revision = string & Readonly<{ [revisionBrand]: never }>;
