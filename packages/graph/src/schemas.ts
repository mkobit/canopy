import { z } from 'zod';
import type { Instant, PlainDate, TemporalMetadata } from './temporal';
import { PROPERTY_VALUE_KINDS } from './properties';
import type { PropertyValue, PropertyDefinition, PropertyValueKind } from './properties';
import type { ScalarValue } from './scalars';
import type { Node } from './node';
import type { Edge } from './edge';
import type { ShapePropertyBinding } from './definitions';
import type { Graph } from './graph';
import type { NodeId, EdgeId, Namespace } from './identifiers';
import type { HlcTimestamp } from './hlc';

import {
  asNodeId,
  asEdgeId,
  asShapeId,
  asPropertyTypeId,
  asBatchId,
  asGraphId,
  asInstant,
  asPlainDate,
  asDeviceId,
  asNamespace,
  asEventId,
  asCommitSeq,
  asPrincipalId,
  asActorId,
} from './factories';
import { asHlcTimestamp, isValidHlcTimestamp } from './hlc';
import { asRevision } from './revision';

// Helpers to transform strings to branded types using the "as" casters from types.
// We rely on Zod's validation (regex/datetime) before casting.

// Node and edge IDs are non-empty strings; user-created IDs are UUIDs but system IDs are semantic (e.g. 'query:system:all-nodes').
export const NodeIdSchema = z.string().min(1).transform(asNodeId);
export const EdgeIdSchema = z.string().min(1).transform(asEdgeId);
export const ShapeIdSchema = z.string().min(1).transform(asShapeId);
export const PropertyTypeIdSchema = z.string().min(1).transform(asPropertyTypeId);
export const BatchIdSchema = z.string().min(1).transform(asBatchId);
export const GraphIdSchema = z.string().uuid().transform(asGraphId);
export const DeviceIdSchema = z.string().uuid().transform(asDeviceId);
export const RevisionSchema = z.string().uuid().transform(asRevision);
export const CommitSeqSchema = z.number().int().nonnegative().safe().transform(asCommitSeq);
export const PrincipalIdSchema = z.string().min(1).transform(asPrincipalId);
export const ActorIdSchema = z.string().min(1).transform(asActorId);
export const ActorKindSchema = z.enum(['user', 'agent', 'plugin', 'workflow']);
export const HlcTimestampSchema: z.ZodType<HlcTimestamp, unknown> = z
  .string()
  .refine(isValidHlcTimestamp, 'Invalid HLC timestamp format')
  .transform((value) => {
    const parsed = asHlcTimestamp(value);
    return parsed.ok ? parsed.value : (value as HlcTimestamp);
  });

export const NamespaceSchema: z.ZodType<Namespace, unknown> = z
  .string()
  .regex(
    /^[A-Za-z0-9._~-]+$/,
    'Namespace must be a valid URI path segment (unreserved characters only)',
  )
  .transform(asNamespace);

export const InstantSchema: z.ZodType<Instant, unknown> = z
  .string()
  .datetime({ offset: true }) // ISO 8601 strict
  .transform(asInstant);

export const PlainDateSchema: z.ZodType<PlainDate, unknown> = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid PlainDate format (YYYY-MM-DD)')
  .transform(asPlainDate);

// External Reference Value (the only complex scalar object)
const ExternalReferenceValueSchema = z.object({
  graph: GraphIdSchema,
  target: NodeIdSchema,
});

// Scalar Values
// Since we removed tagged unions, we map based on runtime types.
// Note: string covers NodeId, Instant, PlainDate.
const ScalarValueSchema: z.ZodType<ScalarValue, unknown> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  ExternalReferenceValueSchema,
]);

// Property Value
// Either a scalar or an array of scalars
export const PropertyValueSchema: z.ZodType<PropertyValue, unknown> = z.union([
  ScalarValueSchema,
  z.array(ScalarValueSchema),
]);

export const PropertyValueKindSchema: z.ZodType<PropertyValueKind, unknown> =
  z.enum(PROPERTY_VALUE_KINDS);

export const PropertyDefinitionSchema: z.ZodType<PropertyDefinition, unknown> = z
  .object({
    name: z.string(),
    valueKind: PropertyValueKindSchema,
    required: z.boolean(),
    description: z.string().optional(),
    regex: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    choices: z.array(z.string()).optional(),
    nullable: z.boolean().nullish(),
    cardinality: z.enum(['one', 'many']).optional(),
    unique: z.boolean().optional(),
    targetShapeId: ShapeIdSchema.optional(),
    targetTypeId: ShapeIdSchema.optional(),
    schemaOrgUri: z.string().optional(),
  })
  .refine((value) => value.unique !== true || value.cardinality === 'many', {
    path: ['unique'],
    message: "PropertyDefinition 'unique: true' requires cardinality 'many'",
  })
  .refine(
    (value) =>
      (value.targetShapeId === undefined && value.targetTypeId === undefined) ||
      value.valueKind === 'reference',
    {
      path: ['targetShapeId'],
      message: "PropertyDefinition 'targetShapeId' is only valid when valueKind is 'reference'",
    },
  )
  .transform((value) => ({
    ...value,
    description: value.description ?? undefined,
    regex: value.regex ?? undefined,
    min: value.min ?? undefined,
    max: value.max ?? undefined,
    choices: value.choices ?? undefined,
    nullable: value.nullable ?? undefined,
    cardinality: value.cardinality ?? undefined,
    unique: value.unique ?? undefined,
    targetShapeId: value.targetShapeId ?? value.targetTypeId ?? undefined,
    targetTypeId: value.targetTypeId ?? undefined,
    schemaOrgUri: value.schemaOrgUri ?? undefined,
  }));

export const TemporalMetadataSchema: z.ZodType<TemporalMetadata, unknown> = z.object({
  created: InstantSchema,
  modified: InstantSchema,
  modifiedBy: DeviceIdSchema,
  hlcTimestamp: HlcTimestampSchema.optional(),
});

// Property Map: Map<string, PropertyValue>
// Allows parsing from a Map or a plain object (JSON record).
export const PropertyMapSchema = z.union([
  z.map(z.string(), PropertyValueSchema),
  z.record(z.string(), PropertyValueSchema).transform((record) => new Map(Object.entries(record))),
]);

export const NodeSchema: z.ZodType<Node, unknown> = z.object({
  id: NodeIdSchema,
  shape: ShapeIdSchema.optional(),
  properties: PropertyMapSchema,
  metadata: TemporalMetadataSchema,
});

export const EdgeSchema: z.ZodType<Edge, unknown> = z.object({
  id: EdgeIdSchema,
  shape: ShapeIdSchema.optional(),
  source: NodeIdSchema,
  target: NodeIdSchema,
  properties: PropertyMapSchema,
  metadata: TemporalMetadataSchema,
});

export const GraphSchema: z.ZodType<Graph, unknown> = z.object({
  id: GraphIdSchema,
  name: z.string(),
  metadata: TemporalMetadataSchema,
  revision: RevisionSchema,
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

export const ShapePropertyBindingSchema: z.ZodType<ShapePropertyBinding, unknown> = z.union([
  z
    .object({
      kind: z.literal('reference'),
      name: z.string().min(1),
      required: z.boolean(),
      propertyTypeId: PropertyTypeIdSchema,
      cardinality: z.enum(['one', 'many']).optional(),
      description: z.string().optional(),
    })
    .transform((value) => ({
      ...value,
      cardinality: value.cardinality ?? undefined,
      description: value.description ?? undefined,
    })),
  z.object({
    kind: z.literal('inline'),
    definition: PropertyDefinitionSchema,
  }),
  PropertyDefinitionSchema.transform((definition) => ({
    kind: 'inline' as const,
    definition,
  })),
]);

export const EventIdSchema = z.string().uuid().transform(asEventId);

const eventProvenanceShape = {
  timestamp: InstantSchema,
  deviceId: DeviceIdSchema,
  batchId: BatchIdSchema.optional(),
  hlcTimestamp: HlcTimestampSchema.optional(),
  commitSeq: CommitSeqSchema.optional(),
  principalId: PrincipalIdSchema.optional(),
  actorId: ActorIdSchema.optional(),
  actorKind: ActorKindSchema.optional(),
};

export const WorkflowStartedSchema = z.object({
  type: z.literal('WorkflowStarted'),
  eventId: EventIdSchema,
  workflowId: NodeIdSchema,
  triggerId: NodeIdSchema,
  ...eventProvenanceShape,
});

export const WorkflowCompletedSchema = z.object({
  type: z.literal('WorkflowCompleted'),
  eventId: EventIdSchema,
  executionId: EventIdSchema,
  ...eventProvenanceShape,
});

export const NodeCreatedSchema = z.object({
  type: z.literal('NodeCreated'),
  eventId: EventIdSchema,
  id: NodeIdSchema,
  shapeId: ShapeIdSchema.optional(),
  properties: PropertyMapSchema,
  ...eventProvenanceShape,
  migrationId: z.string().optional(),
});

export const NodePropertiesUpdatedSchema = z.object({
  type: z.literal('NodePropertiesUpdated'),
  eventId: EventIdSchema,
  id: NodeIdSchema,
  changes: PropertyMapSchema,
  ...eventProvenanceShape,
  migrationId: z.string().optional(),
});

export const NodeDeletedSchema = z.object({
  type: z.literal('NodeDeleted'),
  eventId: EventIdSchema,
  id: NodeIdSchema,
  ...eventProvenanceShape,
  migrationId: z.string().optional(),
});

export const EdgeCreatedSchema = z.object({
  type: z.literal('EdgeCreated'),
  eventId: EventIdSchema,
  id: EdgeIdSchema,
  shapeId: ShapeIdSchema.optional(),
  source: NodeIdSchema,
  target: NodeIdSchema,
  properties: PropertyMapSchema,
  ...eventProvenanceShape,
  migrationId: z.string().optional(),
});

export const EdgePropertiesUpdatedSchema = z.object({
  type: z.literal('EdgePropertiesUpdated'),
  eventId: EventIdSchema,
  id: EdgeIdSchema,
  changes: PropertyMapSchema,
  ...eventProvenanceShape,
  migrationId: z.string().optional(),
});

export const EdgeDeletedSchema = z.object({
  type: z.literal('EdgeDeleted'),
  eventId: EventIdSchema,
  id: EdgeIdSchema,
  ...eventProvenanceShape,
  migrationId: z.string().optional(),
});

export const GraphEventSchema = z.discriminatedUnion('type', [
  WorkflowStartedSchema,
  WorkflowCompletedSchema,
  NodeCreatedSchema,
  NodePropertiesUpdatedSchema,
  NodeDeletedSchema,
  EdgeCreatedSchema,
  EdgePropertiesUpdatedSchema,
  EdgeDeletedSchema,
]);
