import { z } from 'zod';
import type {
  Instant,
  PlainDate,
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
  EdgeId
} from '@canopy/types';

import {
    asNodeId,
    asEdgeId,
    asTypeId,
    asGraphId,
    asInstant,
    asPlainDate
} from '@canopy/types';

// Helpers to transform strings to branded types using the "as" casters from types.
// We rely on Zod's validation (regex/datetime) before casting.

export const InstantSchema: z.ZodType<Instant, z.ZodTypeDef, unknown> = z
  .string()
  .datetime({ offset: true }) // ISO 8601 strict
  .transform(val => asInstant(val));

export const PlainDateSchema: z.ZodType<PlainDate, z.ZodTypeDef, unknown> = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid PlainDate format (YYYY-MM-DD)")
  .transform(val => asPlainDate(val));

export const TimestampSchema = InstantSchema;

// Scalar Values
const TextValueSchema = z.object({ kind: z.literal('text'), value: z.string() });
const NumberValueSchema = z.object({ kind: z.literal('number'), value: z.number() });
const BooleanValueSchema = z.object({ kind: z.literal('boolean'), value: z.boolean() });
const InstantValueSchema = z.object({ kind: z.literal('instant'), value: InstantSchema });
const PlainDateValueSchema = z.object({ kind: z.literal('plain-date'), value: PlainDateSchema });
const ReferenceValueSchema = z.object({
    kind: z.literal('reference'),
    target: z.string().uuid().transform(asNodeId)
});
const ExternalReferenceValueSchema = z.object({
    kind: z.literal('external-reference'),
    graph: z.string().uuid().transform(asGraphId),
    target: z.string().uuid().transform(asNodeId)
});

const ScalarValueSchema: z.ZodType<ScalarValue, z.ZodTypeDef, unknown> = z.discriminatedUnion('kind', [
  TextValueSchema,
  NumberValueSchema,
  BooleanValueSchema,
  InstantValueSchema,
  PlainDateValueSchema,
  ReferenceValueSchema,
  ExternalReferenceValueSchema
]);

// List Value - array of scalars
const ListValueSchema = z.object({
  kind: z.literal('list'),
  items: z.array(ScalarValueSchema)
});

// Property Value
export const PropertyValueSchema: z.ZodType<PropertyValue, z.ZodTypeDef, unknown> = z.discriminatedUnion('kind', [
  TextValueSchema,
  NumberValueSchema,
  BooleanValueSchema,
  InstantValueSchema,
  PlainDateValueSchema,
  ReferenceValueSchema,
  ExternalReferenceValueSchema,
  ListValueSchema
]);

export const PropertyDefinitionSchema: z.ZodType<PropertyDefinition, z.ZodTypeDef, unknown> = z.object({
  name: z.string(),
  valueKind: z.enum(['text', 'number', 'boolean', 'instant', 'plain-date', 'reference', 'external-reference', 'list']),
  required: z.boolean(),
  description: z.string().optional(),
}).transform(val => ({
  ...val,
  description: val.description ?? undefined // ensure explicit undefined if missing (though optional usually means | undefined)
}));

export const TemporalMetadataSchema: z.ZodType<TemporalMetadata, z.ZodTypeDef, unknown> = z.object({
  created: InstantSchema,
  modified: InstantSchema,
});

// Property Map: Map<string, PropertyValue>
// Allows parsing from a Map or a plain object (JSON record).
export const PropertyMapSchema = z.union([
  z.map(z.string(), PropertyValueSchema),
  z.record(z.string(), PropertyValueSchema).transform((record) => new Map(Object.entries(record)))
]);

export const NodeSchema: z.ZodType<Node, z.ZodTypeDef, unknown> = z.object({
  id: z.string().uuid().transform(asNodeId),
  type: z.string().min(1).transform(asTypeId),
  properties: PropertyMapSchema,
  metadata: TemporalMetadataSchema
});

export const EdgeSchema: z.ZodType<Edge, z.ZodTypeDef, unknown> = z.object({
  id: z.string().uuid().transform(asEdgeId),
  type: z.string().min(1).transform(asTypeId),
  source: z.string().uuid().transform(asNodeId),
  target: z.string().uuid().transform(asNodeId),
  properties: PropertyMapSchema,
  metadata: TemporalMetadataSchema
});

export const GraphSchema: z.ZodType<Graph, z.ZodTypeDef, unknown> = z.object({
  id: z.string().uuid().transform(asGraphId),
  name: z.string(),
  metadata: TemporalMetadataSchema,
  nodes: z.union([
    z.map(z.string().uuid().transform(asNodeId), NodeSchema),
    z.record(z.string().uuid(), NodeSchema).transform((record) => {
        return new Map<NodeId, Node>(
            Object.entries(record).map(([key, value]) => [asNodeId(key), value])
        );
    })
  ]),
  edges: z.union([
      z.map(z.string().uuid().transform(asEdgeId), EdgeSchema),
      z.record(z.string().uuid(), EdgeSchema).transform((record) => {
          return new Map<EdgeId, Edge>(
            Object.entries(record).map(([key, value]) => [asEdgeId(key), value])
          );
      })
  ])
});

export const NodeTypeDefinitionSchema: z.ZodType<NodeTypeDefinition, z.ZodTypeDef, unknown> = z.object({
  id: z.string().min(1).transform(asTypeId),
  name: z.string(),
  description: z.string().optional(),
  properties: z.array(PropertyDefinitionSchema),
  validOutgoingEdges: z.array(z.string().transform(asTypeId)),
  validIncomingEdges: z.array(z.string().transform(asTypeId)),
}).transform(val => ({
  ...val,
  description: val.description ?? undefined
}));

export const EdgeTypeDefinitionSchema: z.ZodType<EdgeTypeDefinition, z.ZodTypeDef, unknown> = z.object({
  id: z.string().min(1).transform(asTypeId),
  name: z.string(),
  description: z.string().optional(),
  sourceTypes: z.array(z.string().transform(asTypeId)),
  targetTypes: z.array(z.string().transform(asTypeId)),
  properties: z.array(PropertyDefinitionSchema),
  transitive: z.boolean(),
  inverse: z.string().transform(asTypeId).optional(),
}).transform(val => ({
  ...val,
  description: val.description ?? undefined,
  inverse: val.inverse ?? undefined
}));
