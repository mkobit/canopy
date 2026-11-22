import type { GraphEvent } from './events';
import type { Result } from './result';
import { ok, err as error } from './result';
import { GraphEventSchema } from './schemas';

export type EventDecodeError = Readonly<{
  code: 'INVALID_EVENT_SHAPE' | 'CONFLICTING_LEGACY_FIELDS';
  message: string;
  details?: unknown | undefined;
}>;

export interface UpcastOptions {
  readonly remapRetiredMetaShapes?: boolean | undefined; // false in bead a; true from bead b onward
}

const RETIRED_NODE_TYPE = 'node:type:node-type';
const RETIRED_EDGE_TYPE = 'node:type:edge-type';
const UNIFIED_SHAPE = 'node:type:shape';
const OPEN_SENTINEL = 'canopy:open';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRetiredMetaId(id: unknown): id is typeof RETIRED_NODE_TYPE | typeof RETIRED_EDGE_TYPE {
  return id === RETIRED_NODE_TYPE || id === RETIRED_EDGE_TYPE;
}

function withDefaultProperty(properties: unknown, key: string, value: unknown): unknown {
  if (properties instanceof Map) {
    return properties.has(key)
      ? properties
      : new Map<unknown, unknown>([...properties, [key, value]]);
  }
  if (isRecord(properties)) {
    return Object.hasOwn(properties, key) ? properties : { ...properties, [key]: value };
  }
  return { [key]: value };
}

function stripKey(
  record: Readonly<Record<string, unknown>>,
  keyToRemove: string,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== keyToRemove));
}

function resolveEffectiveShape(legacyShape: unknown, modernShape: unknown): unknown {
  if (legacyShape === OPEN_SENTINEL || modernShape === OPEN_SENTINEL) {
    return OPEN_SENTINEL;
  }
  return typeof legacyShape === 'string' && legacyShape !== '' ? legacyShape : modernShape;
}

function upcastNodeCreated(
  raw: Readonly<Record<string, unknown>>,
  remapRetiredMetaShapes: boolean,
): Readonly<Record<string, unknown>> {
  const withoutLegacy = 'nodeType' in raw ? stripKey(raw, 'nodeType') : raw;
  const effectiveShape = resolveEffectiveShape(raw.nodeType, raw.shapeId);

  if (effectiveShape === OPEN_SENTINEL || effectiveShape === undefined) {
    return 'shapeId' in withoutLegacy ? stripKey(withoutLegacy, 'shapeId') : withoutLegacy;
  }

  if (remapRetiredMetaShapes && isRetiredMetaId(effectiveShape)) {
    const entityKind = effectiveShape === RETIRED_EDGE_TYPE ? 'edge' : 'node';
    return {
      ...withoutLegacy,
      shapeId: UNIFIED_SHAPE,
      properties: withDefaultProperty(withoutLegacy.properties, 'entityKind', entityKind),
    };
  }

  return typeof effectiveShape === 'string'
    ? { ...withoutLegacy, shapeId: effectiveShape }
    : withoutLegacy;
}

function upcastEdgeCreated(
  raw: Readonly<Record<string, unknown>>,
  remapRetiredMetaShapes: boolean,
): Readonly<Record<string, unknown>> {
  const remappedEndpoints: Readonly<Record<string, unknown>> = remapRetiredMetaShapes
    ? {
        ...raw,
        ...(isRetiredMetaId(raw.source) && { source: UNIFIED_SHAPE }),
        ...(isRetiredMetaId(raw.target) && { target: UNIFIED_SHAPE }),
      }
    : raw;
  const withoutLegacy =
    'edgeType' in remappedEndpoints ? stripKey(remappedEndpoints, 'edgeType') : remappedEndpoints;
  const effectiveShape = resolveEffectiveShape(raw.edgeType, raw.shapeId);

  if (effectiveShape === OPEN_SENTINEL || effectiveShape === undefined) {
    return 'shapeId' in withoutLegacy ? stripKey(withoutLegacy, 'shapeId') : withoutLegacy;
  }

  return typeof effectiveShape === 'string'
    ? { ...withoutLegacy, shapeId: effectiveShape }
    : withoutLegacy;
}

/**
Pure, idempotent, stateless read-side event upcaster. Never throws.
Runs on raw decoded JSON objects or IndexedDB structured clones.
*/
export function upcastStoredEvent(raw: unknown, options?: UpcastOptions | undefined): unknown {
  if (!isRecord(raw)) {
    return raw;
  }
  const remapRetiredMetaShapes = options?.remapRetiredMetaShapes ?? false;

  if (raw.type === 'NodeCreated') {
    return upcastNodeCreated(raw, remapRetiredMetaShapes);
  }

  return raw.type === 'EdgeCreated' ? upcastEdgeCreated(raw, remapRetiredMetaShapes) : raw;
}

function checkDualFieldConflict(
  raw: Readonly<Record<string, unknown>>,
): EventDecodeError | undefined {
  if (raw.type === 'NodeCreated' && 'shapeId' in raw && 'nodeType' in raw) {
    const { shapeId, nodeType } = raw;
    if (
      shapeId !== undefined &&
      nodeType !== undefined &&
      (nodeType === OPEN_SENTINEL || nodeType !== shapeId)
    ) {
      return {
        code: 'CONFLICTING_LEGACY_FIELDS',
        message: `Conflicting NodeCreated shapeId '${String(shapeId)}' and legacy nodeType '${String(nodeType)}'`,
        details: { shapeId, nodeType },
      };
    }
  }

  if (raw.type === 'EdgeCreated' && 'shapeId' in raw && 'edgeType' in raw) {
    const { shapeId, edgeType } = raw;
    if (
      shapeId !== undefined &&
      edgeType !== undefined &&
      (edgeType === OPEN_SENTINEL || edgeType !== shapeId)
    ) {
      return {
        code: 'CONFLICTING_LEGACY_FIELDS',
        message: `Conflicting EdgeCreated shapeId '${String(shapeId)}' and legacy edgeType '${String(edgeType)}'`,
        details: { shapeId, edgeType },
      };
    }
  }

  return undefined;
}

function isRetiredMetaLifecycleEvent(raw: Readonly<Record<string, unknown>>): boolean {
  return (
    typeof raw.type === 'string' &&
    ['NodeCreated', 'NodePropertiesUpdated', 'NodeDeleted'].includes(raw.type) &&
    isRetiredMetaId(raw.id)
  );
}

/**
Checks dual-field conflicts before `upcastStoredEvent`, skips retired meta-node events
as `ok(null)` when `remapRetiredMetaShapes` is enabled, then validates via `GraphEventSchema.safeParse`.
*/
export function decodeStoredEvent(
  raw: unknown,
  options?: UpcastOptions | undefined,
): Result<GraphEvent | null, EventDecodeError> {
  if (isRecord(raw)) {
    const conflict = checkDualFieldConflict(raw);
    if (conflict !== undefined) {
      return error(conflict);
    }

    const remapRetiredMetaShapes = options?.remapRetiredMetaShapes ?? false;
    if (remapRetiredMetaShapes && isRetiredMetaLifecycleEvent(raw)) {
      return ok(null);
    }
  }

  const upcasted = upcastStoredEvent(raw, options);
  const parsed = GraphEventSchema.safeParse(upcasted);
  return parsed.success
    ? ok(parsed.data)
    : error({
        code: 'INVALID_EVENT_SHAPE',
        message: parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
        details: parsed.error.issues,
      });
}
