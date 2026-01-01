import { z } from 'zod';
import type {
  Instant,
  PlainDate,
  PropertyValue,
  TemporalMetadata,
  Node,
  Edge,
  NodeTypeDefinition,
  EdgeTypeDefinition,
  PropertyDefinition
} from '@canopy/types';

import {
    asNodeId,
    asEdgeId,
    asTypeId,
    asInstant,
    asPlainDate,
    asGraphId
} from '@canopy/types';

// Zod schemas corresponding to types in @canopy/types

export const InstantSchema: z.ZodType<Instant, z.ZodTypeDef, unknown> = z.string().datetime().transform(val => asInstant(val));
export const PlainDateSchema: z.ZodType<PlainDate, z.ZodTypeDef, unknown> = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform(val => asPlainDate(val));

// Backward compatibility alias if needed, but 'Instant' is preferred
export const TimestampSchema = InstantSchema;

export const PropertyValueSchema: z.ZodType<PropertyValue, z.ZodTypeDef, unknown> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), value: z.string() }),
  z.object({ kind: z.literal('number'), value: z.number() }),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }),
  z.object({ kind: z.literal('instant'), value: InstantSchema }),
  z.object({ kind: z.literal('plain-date'), value: PlainDateSchema }),
  z.object({ kind: z.literal('reference'), target: z.string().transform(val => asNodeId(val)) }),
  z.object({ kind: z.literal('external-reference'), graph: z.string().transform(val => asGraphId(val)), target: z.string().transform(val => asNodeId(val)) }),
  // Recursive definition for list needs lazy evaluation if deep, but for now strict structure
  z.object({ kind: z.literal('list'), items: z.array(z.any()) }) // Changed value -> items to match types
]);

export const PropertyDefinitionSchema: z.ZodType<PropertyDefinition, z.ZodTypeDef, unknown> = z.object({
  name: z.string(),
  valueKind: z.enum(['text', 'number', 'boolean', 'instant', 'plain-date', 'reference', 'external-reference', 'list']),
  required: z.boolean(),
  description: z.string().optional(),
}).transform(val => ({
  ...val,
  description: val.description
}));

export const TemporalMetadataSchema: z.ZodType<TemporalMetadata, z.ZodTypeDef, unknown> = z.object({
  created: InstantSchema,
  modified: InstantSchema,
});

export const NodeSchema: z.ZodType<Node, z.ZodTypeDef, unknown> = z.object({
  id: z.string().transform(val => asNodeId(val)),
  type: z.string().transform(val => asTypeId(val)),
  properties: z.map(z.string(), PropertyValueSchema),
  metadata: TemporalMetadataSchema
});

export const EdgeSchema: z.ZodType<Edge, z.ZodTypeDef, unknown> = z.object({
  id: z.string().transform(val => asEdgeId(val)),
  type: z.string().transform(val => asTypeId(val)),
  source: z.string().transform(val => asNodeId(val)),
  target: z.string().transform(val => asNodeId(val)),
  properties: z.map(z.string(), PropertyValueSchema),
  metadata: TemporalMetadataSchema
});

export const NodeTypeDefinitionSchema: z.ZodType<NodeTypeDefinition, z.ZodTypeDef, unknown> = z.object({
  id: z.string().transform(val => asTypeId(val)),
  name: z.string(),
  description: z.string().optional(),
  properties: z.array(PropertyDefinitionSchema),
  validOutgoingEdges: z.array(z.string().transform(val => asTypeId(val))),
  validIncomingEdges: z.array(z.string().transform(val => asTypeId(val))),
}).transform(val => ({
  ...val,
  description: val.description
}));

export const EdgeTypeDefinitionSchema: z.ZodType<EdgeTypeDefinition, z.ZodTypeDef, unknown> = z.object({
  id: z.string().transform(val => asTypeId(val)),
  name: z.string(),
  description: z.string().optional(),
  sourceTypes: z.array(z.string().transform(val => asTypeId(val))),
  targetTypes: z.array(z.string().transform(val => asTypeId(val))),
  properties: z.array(PropertyDefinitionSchema),
  transitive: z.boolean(),
  inverse: z.string().transform(val => asTypeId(val)).optional(),
}).transform(val => ({
  ...val,
  description: val.description,
  inverse: val.inverse
}));
