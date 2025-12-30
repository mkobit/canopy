import { z } from 'zod';

export const PropertyTypeSchema = z.enum(['string', 'number', 'boolean', 'date']);

export const PropertyDefinitionSchema = z.object({
  name: z.string(),
  type: PropertyTypeSchema,
  required: z.boolean().optional(),
});

export const NodeTypeDefinitionSchema = z.object({
  name: z.string(),
  properties: z.array(PropertyDefinitionSchema),
});

export const NodeSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  properties: z.record(z.string(), z.any()),
  created: z.string().datetime(),
  modified: z.string().datetime(),
});

export type Node = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  id: z.string().uuid(),
  source: z.string().uuid(),
  target: z.string().uuid(),
  type: z.string(),
  properties: z.record(z.string(), z.any()),
  created: z.string().datetime(),
  modified: z.string().datetime(),
});

export type Edge = z.infer<typeof EdgeSchema>;

export const NodeTypeSchema = NodeSchema.extend({
  type: z.literal('NodeType'),
  properties: NodeTypeDefinitionSchema,
});

export type NodeType = z.infer<typeof NodeTypeSchema>;

export const EdgeTypeDefinitionSchema = z.object({
  name: z.string(),
  properties: z.array(PropertyDefinitionSchema),
  // Constraints can be added here later
});

export const EdgeTypeSchema = NodeSchema.extend({
  type: z.literal('EdgeType'),
  properties: EdgeTypeDefinitionSchema,
});

export type EdgeType = z.infer<typeof EdgeTypeSchema>;
