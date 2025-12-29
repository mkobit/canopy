import { z } from 'zod';

export const NodeSchema = z.object({
  id: z.string().uuid(),
  labels: z.array(z.string()),
  properties: z.record(z.string(), z.any()),
});

export type Node = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  id: z.string().uuid(),
  source: z.string().uuid(),
  target: z.string().uuid(),
  type: z.string(),
  properties: z.record(z.string(), z.any()),
});

export type Edge = z.infer<typeof EdgeSchema>;
