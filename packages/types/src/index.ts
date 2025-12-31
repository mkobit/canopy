// Layer 1: branded primitives
export type NodeId = string & { readonly __brand: 'NodeId' };
export type EdgeId = string & { readonly __brand: 'EdgeId' };
export type TypeId = string & { readonly __brand: 'TypeId' };
export type Timestamp = string & { readonly __brand: 'ISO8601' };

// Helpers for branding
export const asNodeId = (id: string) => id as NodeId;
export const asEdgeId = (id: string) => id as EdgeId;
export const asTypeId = (id: string) => id as TypeId;
export const asTimestamp = (t: string) => t as Timestamp;

// Layer 2: domain value types
export interface TemporalMetadata {
  readonly created: Timestamp;
  readonly modified: Timestamp;
}

// Layer 3: property system (meta-circular foundation)
export type PropertyValue =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'timestamp'; readonly value: Timestamp }
  | { readonly kind: 'reference'; readonly value: NodeId }
  | { readonly kind: 'list'; readonly value: readonly PropertyValue[] };

export interface PropertyDefinition {
  readonly name: string;
  readonly valueKind: PropertyValue['kind'];
  readonly required: boolean;
  readonly description?: string;
}

// Layer 4: node and edge structures
export interface Node<T extends TypeId = TypeId> {
  readonly id: NodeId;
  readonly type: T;
  readonly properties: ReadonlyMap<string, PropertyValue>;
  readonly metadata: TemporalMetadata;
}

export interface Edge<T extends TypeId = TypeId> {
  readonly id: EdgeId;
  readonly type: T;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly properties: ReadonlyMap<string, PropertyValue>;
  readonly metadata: TemporalMetadata;
}

// Layer 5: meta-circular type definitions (types are nodes)
export interface NodeTypeDefinition {
  readonly id: TypeId;
  readonly name: string;
  readonly properties: readonly PropertyDefinition[];
  readonly validOutgoingEdges: readonly TypeId[];
  readonly validIncomingEdges: readonly TypeId[];
}

export interface EdgeTypeDefinition {
  readonly id: TypeId;
  readonly name: string;
  readonly sourceTypes: readonly TypeId[];
  readonly targetTypes: readonly TypeId[];
  readonly properties: readonly PropertyDefinition[];
  readonly transitive: boolean;
  readonly symmetric: boolean;
  readonly inverse?: TypeId;
}
