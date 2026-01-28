import { z } from 'zod';
import type { Node, Edge, PropertyValue, EventId, NodeId, TypeId, EdgeId, Instant } from '@canopy/types';
import { asNodeId, asEdgeId, asTypeId, asEventId } from '@canopy/types';
import { PropertyValueSchema, TemporalMetadataSchema, InstantSchema } from '@canopy/schema';

// Helper types for storage (Plain Objects)
export type StorableProperties = Record<string, PropertyValue>;

export interface StorableNode extends Omit<Node, 'properties'> {
  readonly properties: StorableProperties;
}

export interface StorableEdge extends Omit<Edge, 'properties'> {
  readonly properties: StorableProperties;
}

// Storable Events
export interface StorableNodeCreated {
  readonly type: 'NodeCreated';
  readonly eventId: EventId;
  readonly id: NodeId;
  readonly nodeType: TypeId;
  readonly properties: StorableProperties;
  readonly timestamp: Instant;
}

export interface StorableNodePropertiesUpdated {
  readonly type: 'NodePropertiesUpdated';
  readonly eventId: EventId;
  readonly id: NodeId;
  readonly changes: StorableProperties;
  readonly timestamp: Instant;
}

export interface StorableNodeDeleted {
  readonly type: 'NodeDeleted';
  readonly eventId: EventId;
  readonly id: NodeId;
  readonly timestamp: Instant;
}

export interface StorableEdgeCreated {
  readonly type: 'EdgeCreated';
  readonly eventId: EventId;
  readonly id: EdgeId;
  readonly edgeType: TypeId;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly properties: StorableProperties;
  readonly timestamp: Instant;
}

export interface StorableEdgePropertiesUpdated {
  readonly type: 'EdgePropertiesUpdated';
  readonly eventId: EventId;
  readonly id: EdgeId;
  readonly changes: StorableProperties;
  readonly timestamp: Instant;
}

export interface StorableEdgeDeleted {
  readonly type: 'EdgeDeleted';
  readonly eventId: EventId;
  readonly id: EdgeId;
  readonly timestamp: Instant;
}

export type StorableGraphEvent =
  | StorableNodeCreated
  | StorableNodePropertiesUpdated
  | StorableNodeDeleted
  | StorableEdgeCreated
  | StorableEdgePropertiesUpdated
  | StorableEdgeDeleted;

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

export const StorableNodeCreatedSchema = z.object({
  type: z.literal('NodeCreated'),
  eventId: z.string().transform((val) => asEventId(val)),
  id: z.string().transform((val) => asNodeId(val)),
  nodeType: z.string().transform((val) => asTypeId(val)),
  properties: StorablePropertiesSchema,
  timestamp: InstantSchema,
});

export const StorableNodePropertiesUpdatedSchema = z.object({
  type: z.literal('NodePropertiesUpdated'),
  eventId: z.string().transform((val) => asEventId(val)),
  id: z.string().transform((val) => asNodeId(val)),
  changes: StorablePropertiesSchema,
  timestamp: InstantSchema,
});

export const StorableNodeDeletedSchema = z.object({
  type: z.literal('NodeDeleted'),
  eventId: z.string().transform((val) => asEventId(val)),
  id: z.string().transform((val) => asNodeId(val)),
  timestamp: InstantSchema,
});

export const StorableEdgeCreatedSchema = z.object({
  type: z.literal('EdgeCreated'),
  eventId: z.string().transform((val) => asEventId(val)),
  id: z.string().transform((val) => asEdgeId(val)),
  edgeType: z.string().transform((val) => asTypeId(val)),
  source: z.string().transform((val) => asNodeId(val)),
  target: z.string().transform((val) => asNodeId(val)),
  properties: StorablePropertiesSchema,
  timestamp: InstantSchema,
});

export const StorableEdgePropertiesUpdatedSchema = z.object({
  type: z.literal('EdgePropertiesUpdated'),
  eventId: z.string().transform((val) => asEventId(val)),
  id: z.string().transform((val) => asEdgeId(val)),
  changes: StorablePropertiesSchema,
  timestamp: InstantSchema,
});

export const StorableEdgeDeletedSchema = z.object({
  type: z.literal('EdgeDeleted'),
  eventId: z.string().transform((val) => asEventId(val)),
  id: z.string().transform((val) => asEdgeId(val)),
  timestamp: InstantSchema,
});

export const StorableGraphEventSchema: z.ZodType<StorableGraphEvent, unknown> = z.discriminatedUnion(
  'type',
  [
    StorableNodeCreatedSchema,
    StorableNodePropertiesUpdatedSchema,
    StorableNodeDeletedSchema,
    StorableEdgeCreatedSchema,
    StorableEdgePropertiesUpdatedSchema,
    StorableEdgeDeletedSchema,
  ],
);
