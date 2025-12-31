import { z } from 'zod';
import {
  asNodeId,
  asEdgeId,
  asTypeId,
  asTimestamp
} from '@canopy/types';

// Zod schemas corresponding to types in @canopy/types

export const TimestampSchema = z.string().datetime().transform(val => asTimestamp(val));

export const PropertyValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), value: z.string() }),
  z.object({ kind: z.literal('number'), value: z.number() }),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }),
  z.object({ kind: z.literal('timestamp'), value: TimestampSchema }),
  z.object({ kind: z.literal('reference'), value: z.string().transform(val => asNodeId(val)) }),
  // Recursive definition for list needs lazy evaluation if deep, but for now strict structure
  z.object({ kind: z.literal('list'), value: z.array(z.any()) }) // Simplifying for recursion
]);

export const PropertyDefinitionSchema = z.object({
  name: z.string(),
  valueKind: z.enum(['text', 'number', 'boolean', 'timestamp', 'reference', 'list']),
  required: z.boolean(),
  description: z.string().optional(),
});

export const TemporalMetadataSchema = z.object({
  created: TimestampSchema,
  modified: TimestampSchema,
});

export const NodeSchema = z.object({
  id: z.string().transform(val => asNodeId(val)),
  type: z.string().transform(val => asTypeId(val)),
  properties: z.map(z.string(), PropertyValueSchema),
  metadata: TemporalMetadataSchema
});

export const EdgeSchema = z.object({
  id: z.string().transform(val => asEdgeId(val)),
  type: z.string().transform(val => asTypeId(val)),
  source: z.string().transform(val => asNodeId(val)),
  target: z.string().transform(val => asNodeId(val)),
  properties: z.map(z.string(), PropertyValueSchema),
  metadata: TemporalMetadataSchema
});

export const NodeTypeDefinitionSchema = z.object({
  id: z.string().transform(val => asTypeId(val)),
  name: z.string(),
  properties: z.array(PropertyDefinitionSchema),
  validOutgoingEdges: z.array(z.string().transform(val => asTypeId(val))),
  validIncomingEdges: z.array(z.string().transform(val => asTypeId(val))),
});

export const EdgeTypeDefinitionSchema = z.object({
  id: z.string().transform(val => asTypeId(val)),
  name: z.string(),
  sourceTypes: z.array(z.string().transform(val => asTypeId(val))),
  targetTypes: z.array(z.string().transform(val => asTypeId(val))),
  properties: z.array(PropertyDefinitionSchema),
  transitive: z.boolean(),
  symmetric: z.boolean(),
  inverse: z.string().transform(val => asTypeId(val)).optional(),
});
