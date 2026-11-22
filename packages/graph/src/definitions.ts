import type { ShapeId, PropertyTypeId, Namespace } from './identifiers';
import type { PropertyDefinition } from './properties';

export interface NodeShapeExtras {
  readonly validOutgoingEdges: readonly ShapeId[];
  readonly validIncomingEdges: readonly ShapeId[];
}

export interface EdgeShapeExtras {
  readonly sourceTypes: readonly ShapeId[];
  readonly targetTypes: readonly ShapeId[];
  readonly transitive: boolean;
  readonly inverse?: ShapeId | undefined;
}

export type ShapePropertyBinding =
  | Readonly<{
      kind: 'reference';
      name: string;
      required: boolean;
      propertyTypeId: PropertyTypeId;
      cardinality?: 'one' | 'many' | undefined;
      description?: string | undefined;
    }>
  | Readonly<{
      kind: 'inline';
      definition: PropertyDefinition;
    }>;

/**
Defines a node or edge shape in the meta-circular type system.
ShapeDefinition instances are stored as nodes themselves.
*/
export interface ShapeDefinition {
  readonly id: ShapeId;
  readonly name: string;
  readonly namespace: Namespace;
  readonly description?: string | undefined;
  readonly entityKind: 'node' | 'edge';
  readonly closed: boolean;
  readonly properties: readonly ShapePropertyBinding[];
  readonly schemaOrgUri?: string | undefined;
  readonly status: 'active' | 'inactive';
  readonly node?: NodeShapeExtras | undefined;
  readonly edge?: EdgeShapeExtras | undefined;
}
