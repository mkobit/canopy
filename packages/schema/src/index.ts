import { z } from 'zod';
import type {
  NodeId,
  EdgeId,
  TypeId,
  Instant,
  PlainDate,
  GraphId,
  PropertyValue,
  TemporalMetadata,
  Node,
  Edge,
  NodeTypeDefinition,
  EdgeTypeDefinition,
  PropertyDefinition
} from '@canopy/types';

// Zod schemas corresponding to types in @canopy/types

export const InstantSchema: z.ZodType<Instant, z.ZodTypeDef, any> = z.string().datetime().transform(val => val as Instant);
export const PlainDateSchema: z.ZodType<PlainDate, z.ZodTypeDef, any> = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform(val => val as PlainDate);

// Backward compatibility alias if needed, but 'Instant' is preferred
export const TimestampSchema = InstantSchema;

export const PropertyValueSchema: z.ZodType<PropertyValue, z.ZodTypeDef, any> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), value: z.string() }),
  z.object({ kind: z.literal('number'), value: z.number() }),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }),
  z.object({ kind: z.literal('instant'), value: InstantSchema }),
  z.object({ kind: z.literal('plain-date'), value: PlainDateSchema }),
  z.object({ kind: z.literal('reference'), target: z.string().transform(val => val as NodeId) }),
  z.object({ kind: z.literal('external-reference'), graph: z.string().transform(val => val as GraphId), target: z.string().transform(val => val as NodeId) }),
  // Recursive definition for list needs lazy evaluation if deep, but for now strict structure
  z.object({ kind: z.literal('list'), items: z.array(z.any()) }) // Changed value -> items to match types
]);

export const PropertyDefinitionSchema: z.ZodType<PropertyDefinition, z.ZodTypeDef, any> = z.object({
  name: z.string(),
  valueKind: z.enum(['text', 'number', 'boolean', 'instant', 'plain-date', 'reference', 'external-reference', 'list']),
  required: z.boolean(),
  description: z.string().optional(),
}).transform(val => ({
  ...val,
  description: val.description
}));

export const TemporalMetadataSchema: z.ZodType<TemporalMetadata, z.ZodTypeDef, any> = z.object({
  created: InstantSchema,
  modified: InstantSchema,
});

export const NodeSchema: z.ZodType<Node, z.ZodTypeDef, any> = z.object({
  id: z.string().transform(val => val as NodeId),
  type: z.string().transform(val => val as TypeId),
  properties: z.map(z.string(), PropertyValueSchema),
  metadata: TemporalMetadataSchema
});

export const EdgeSchema: z.ZodType<Edge, z.ZodTypeDef, any> = z.object({
  id: z.string().transform(val => val as EdgeId),
  type: z.string().transform(val => val as TypeId),
  source: z.string().transform(val => val as NodeId),
  target: z.string().transform(val => val as NodeId),
  properties: z.map(z.string(), PropertyValueSchema),
  metadata: TemporalMetadataSchema
});

export const NodeTypeDefinitionSchema: z.ZodType<NodeTypeDefinition, z.ZodTypeDef, any> = z.object({
  id: z.string().transform(val => val as TypeId),
  name: z.string(),
  description: z.string().optional(),
  properties: z.array(PropertyDefinitionSchema),
  validOutgoingEdges: z.array(z.string().transform(val => val as TypeId)),
  validIncomingEdges: z.array(z.string().transform(val => val as TypeId)),
}).transform(val => ({
  ...val,
  description: val.description
}));

export const EdgeTypeDefinitionSchema: z.ZodType<EdgeTypeDefinition, z.ZodTypeDef, any> = z.object({
  id: z.string().transform(val => val as TypeId),
  name: z.string(),
  description: z.string().optional(),
  sourceTypes: z.array(z.string().transform(val => val as TypeId)),
  targetTypes: z.array(z.string().transform(val => val as TypeId)),
  properties: z.array(PropertyDefinitionSchema),
  transitive: z.boolean(),
  inverse: z.string().transform(val => val as TypeId).optional(),
}).transform(val => ({
  ...val,
  description: val.description,
  inverse: val.inverse
}));
