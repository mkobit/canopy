import { z } from 'zod';
import type {
  Instant,
  PropertyValue,
  ScalarValue,
  TemporalMetadata,
  Node,
  Edge,
  NodeTypeDefinition,
  EdgeTypeDefinition,
  PropertyDefinition,
  Graph,
  NodeId,
  EdgeId,
} from '@canopy/types';

import { asNodeId, asEdgeId, asTypeId, asGraphId, asInstant } from '@canopy/types';

// Helpers to transform strings to branded types using the "as" casters from types.
// We rely on Zod's validation (regex/datetime) before casting.

export const NodeIdSchema = z.string().uuid().transform(asNodeId);
export const EdgeIdSchema = z.string().uuid().transform(asEdgeId);
export const TypeIdSchema = z.string().min(1).transform(asTypeId);
export const GraphIdSchema = z.string().uuid().transform(asGraphId);

export const InstantSchema: z.ZodType<Instant, unknown> = z.number().transform(asInstant);

export const TimestampSchema = InstantSchema;

// Scalar Values
// Since we removed tagged unions, we map based on runtime types.
// Note: string covers NodeId.
const ScalarValueSchema: z.ZodType<ScalarValue, unknown> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

// Property Value
// Either a scalar or an array of scalars
export const PropertyValueSchema: z.ZodType<PropertyValue, unknown> = z.union([
  ScalarValueSchema,
  z.array(ScalarValueSchema),
]);

export const PropertyDefinitionSchema: z.ZodType<PropertyDefinition, unknown> = z
  .object({
    name: z.string(),
    valueKind: z.enum(['text', 'number', 'boolean', 'instant', 'reference', 'list']),
    required: z.boolean(),
    description: z.string().optional(),
  })
  .transform((val) => ({
    ...val,
    description: val.description ?? undefined,
  }));

export const TemporalMetadataSchema: z.ZodType<TemporalMetadata, unknown> = z.object({
  created: InstantSchema,
  modified: InstantSchema,
});

// Property Map: Map<string, PropertyValue>
// Allows parsing from a Map or a plain object (JSON record).
export const PropertyMapSchema = z.union([
  z.map(z.string(), PropertyValueSchema),
  z.record(z.string(), PropertyValueSchema).transform((record) => new Map(Object.entries(record))),
]);

export const NodeSchema: z.ZodType<Node, unknown> = z.object({
  id: NodeIdSchema,
  type: TypeIdSchema,
  properties: PropertyMapSchema,
  metadata: TemporalMetadataSchema,
});

export const EdgeSchema: z.ZodType<Edge, unknown> = z.object({
  id: EdgeIdSchema,
  type: TypeIdSchema,
  source: NodeIdSchema,
  target: NodeIdSchema,
  properties: PropertyMapSchema,
  metadata: TemporalMetadataSchema,
});

export const GraphSchema: z.ZodType<Graph, unknown> = z.object({
  id: GraphIdSchema,
  name: z.string(),
  metadata: TemporalMetadataSchema,
  nodes: z.union([
    z.map(NodeIdSchema, NodeSchema),
    z.record(z.string().uuid(), NodeSchema).transform((record) => {
      return new Map<NodeId, Node>(
        Object.entries(record).map(([key, value]) => [asNodeId(key), value]),
      );
    }),
  ]),
  edges: z.union([
    z.map(EdgeIdSchema, EdgeSchema),
    z.record(z.string().uuid(), EdgeSchema).transform((record) => {
      return new Map<EdgeId, Edge>(
        Object.entries(record).map(([key, value]) => [asEdgeId(key), value]),
      );
    }),
  ]),
});

export const NodeTypeDefinitionSchema: z.ZodType<NodeTypeDefinition, unknown> = z
  .object({
    id: TypeIdSchema,
    name: z.string(),
    description: z.string().optional(),
    properties: z.array(PropertyDefinitionSchema),
    validOutgoingEdges: z.array(TypeIdSchema),
    validIncomingEdges: z.array(TypeIdSchema),
  })
  .transform((val) => ({
    ...val,
    description: val.description ?? undefined,
  }));

export const EdgeTypeDefinitionSchema: z.ZodType<EdgeTypeDefinition, unknown> = z
  .object({
    id: TypeIdSchema,
    name: z.string(),
    description: z.string().optional(),
    sourceTypes: z.array(TypeIdSchema),
    targetTypes: z.array(TypeIdSchema),
    properties: z.array(PropertyDefinitionSchema),
    transitive: z.boolean(),
    inverse: TypeIdSchema.optional(),
  })
  .transform((val) => ({
    ...val,
    description: val.description ?? undefined,
    inverse: val.inverse ?? undefined,
  }));
