import { z } from 'zod';
import type { Node, Edge, PropertyValue } from '@canopy/types';
import { asNodeId, asEdgeId, asTypeId } from '@canopy/types';
import { PropertyValueSchema, TemporalMetadataSchema } from '@canopy/schema';

// Helper types for storage (Plain Objects)
export type StorableProperties = Record<string, PropertyValue>;

export interface StorableNode extends Omit<Node, 'properties'> {
  readonly properties: StorableProperties;
}

export interface StorableEdge extends Omit<Edge, 'properties'> {
  readonly properties: StorableProperties;
}

// Zod schemas for Storable types
export const StorablePropertiesSchema = z.record(z.string(), PropertyValueSchema);

export const StorableNodeSchema: z.ZodType<StorableNode, unknown> = z.object({
  id: z.string().transform((val) => asNodeId(val)),
  type: z.string().transform((val) => asTypeId(val)),
  properties: StorablePropertiesSchema,
  metadata: TemporalMetadataSchema,
});

export const StorableEdgeSchema: z.ZodType<StorableEdge, unknown> = z.object({
  id: z.string().transform((val) => asEdgeId(val)),
  type: z.string().transform((val) => asTypeId(val)),
  source: z.string().transform((val) => asNodeId(val)),
  target: z.string().transform((val) => asNodeId(val)),
  properties: StorablePropertiesSchema,
  metadata: TemporalMetadataSchema,
});
