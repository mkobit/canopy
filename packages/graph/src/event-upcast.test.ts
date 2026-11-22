import { describe, it, expect } from 'bun:test';
import fc from 'fast-check';
import { upcastStoredEvent, decodeStoredEvent } from './event-upcast';
import {
  asShapeId,
  createEventId,
  createNodeId,
  createEdgeId,
  asDeviceId,
  asInstant,
  asNodeId,
} from './factories';

const DEVICE_ID = asDeviceId('123e4567-e89b-42d3-a456-426614174000');
const TIMESTAMP = asInstant('2026-01-01T00:00:00.000Z');

function baseNodeCreated(
  extra: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    type: 'NodeCreated',
    eventId: createEventId(),
    id: createNodeId(),
    properties: {},
    timestamp: TIMESTAMP,
    deviceId: DEVICE_ID,
    ...extra,
  };
}

function baseEdgeCreated(
  extra: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    type: 'EdgeCreated',
    eventId: createEventId(),
    id: createEdgeId(),
    source: createNodeId(),
    target: createNodeId(),
    properties: {},
    timestamp: TIMESTAMP,
    deviceId: DEVICE_ID,
    ...extra,
  };
}

describe('event-upcast', () => {
  describe('upcastStoredEvent & decodeStoredEvent legacy shapes and sentinels', () => {
    it('upcasts legacy NodeCreated.nodeType to shapeId and strips nodeType', () => {
      const raw = baseNodeCreated({ nodeType: 'user:note' });
      const upcasted = upcastStoredEvent(raw) as Readonly<Record<string, unknown>>;
      expect(upcasted.shapeId).toBe('user:note');
      expect('nodeType' in upcasted).toBe(false);

      const decoded = decodeStoredEvent(raw);
      expect(decoded.ok).toBe(true);
      if (decoded.ok && decoded.value?.type === 'NodeCreated') {
        expect(decoded.value.shapeId).toBe(asShapeId('user:note'));
      }
    });

    it('upcasts legacy EdgeCreated.edgeType to shapeId and strips edgeType', () => {
      const raw = baseEdgeCreated({ edgeType: 'edge:type:references' });
      const upcasted = upcastStoredEvent(raw) as Readonly<Record<string, unknown>>;
      expect(upcasted.shapeId).toBe('edge:type:references');
      expect('edgeType' in upcasted).toBe(false);

      const decoded = decodeStoredEvent(raw);
      expect(decoded.ok).toBe(true);
      if (decoded.ok && decoded.value?.type === 'EdgeCreated') {
        expect(decoded.value.shapeId).toBe(asShapeId('edge:type:references'));
      }
    });

    it('strips canopy:open sentinel in nodeType, edgeType, or shapeId to open entity', () => {
      for (const raw of [
        baseNodeCreated({ nodeType: 'canopy:open' }),
        baseNodeCreated({ shapeId: 'canopy:open' }),
        baseEdgeCreated({ edgeType: 'canopy:open' }),
        baseEdgeCreated({ shapeId: 'canopy:open' }),
      ]) {
        const upcasted = upcastStoredEvent(raw) as Readonly<Record<string, unknown>>;
        expect('nodeType' in upcasted).toBe(false);
        expect('edgeType' in upcasted).toBe(false);
        expect('shapeId' in upcasted).toBe(false);

        const decoded = decodeStoredEvent(raw);
        expect(decoded.ok).toBe(true);
        if (decoded.ok && decoded.value && 'shapeId' in decoded.value) {
          expect(decoded.value.shapeId).toBeUndefined();
        }
      }
    });

    it('treats empty legacy nodeType/edgeType as open but rejects empty modern shapeId', () => {
      const openLegacyNode = decodeStoredEvent(baseNodeCreated({ nodeType: '' }));
      expect(openLegacyNode.ok).toBe(true);
      if (openLegacyNode.ok && openLegacyNode.value?.type === 'NodeCreated') {
        expect(openLegacyNode.value.shapeId).toBeUndefined();
      }

      const openLegacyEdge = decodeStoredEvent(baseEdgeCreated({ edgeType: '' }));
      expect(openLegacyEdge.ok).toBe(true);
      if (openLegacyEdge.ok && openLegacyEdge.value?.type === 'EdgeCreated') {
        expect(openLegacyEdge.value.shapeId).toBeUndefined();
      }

      const invalidModernNode = decodeStoredEvent(baseNodeCreated({ shapeId: '' }));
      expect(invalidModernNode.ok).toBe(false);
      if (!invalidModernNode.ok) {
        expect(invalidModernNode.error.code).toBe('INVALID_EVENT_SHAPE');
      }

      const invalidModernEdge = decodeStoredEvent(baseEdgeCreated({ shapeId: '' }));
      expect(invalidModernEdge.ok).toBe(false);
      if (!invalidModernEdge.ok) {
        expect(invalidModernEdge.error.code).toBe('INVALID_EVENT_SHAPE');
      }
    });

    it('detects dual-field conflicts while allowing identical dual fields', () => {
      for (const conflictRaw of [
        baseNodeCreated({ shapeId: 'a', nodeType: 'b' }),
        baseNodeCreated({ shapeId: 'a', nodeType: 'canopy:open' }),
        baseNodeCreated({ shapeId: 'canopy:open', nodeType: 'canopy:open' }),
        baseEdgeCreated({ shapeId: 'a', edgeType: 'b' }),
        baseEdgeCreated({ shapeId: 'a', edgeType: 'canopy:open' }),
        baseEdgeCreated({ shapeId: 'canopy:open', edgeType: 'canopy:open' }),
      ]) {
        const result = decodeStoredEvent(conflictRaw);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('CONFLICTING_LEGACY_FIELDS');
        }
      }

      const matchingNode = decodeStoredEvent(baseNodeCreated({ shapeId: 'a', nodeType: 'a' }));
      expect(matchingNode.ok).toBe(true);
      if (matchingNode.ok && matchingNode.value?.type === 'NodeCreated') {
        expect(matchingNode.value.shapeId).toBe(asShapeId('a'));
      }

      const matchingEdge = decodeStoredEvent(baseEdgeCreated({ shapeId: 'e', edgeType: 'e' }));
      expect(matchingEdge.ok).toBe(true);
      if (matchingEdge.ok && matchingEdge.value?.type === 'EdgeCreated') {
        expect(matchingEdge.value.shapeId).toBe(asShapeId('e'));
      }
    });
  });

  describe('remapRetiredMetaShapes option', () => {
    it('leaves retired meta-shapes unremapped and unskipped when remapRetiredMetaShapes is false', () => {
      const metaNodeCreated = baseNodeCreated({
        id: asNodeId('node:type:node-type'),
        nodeType: 'node:type:node-type',
      });
      const instanceCreated = baseNodeCreated({ nodeType: 'node:type:edge-type' });
      const metaDeleted = {
        type: 'NodeDeleted',
        eventId: createEventId(),
        id: 'node:type:edge-type',
        timestamp: TIMESTAMP,
        deviceId: DEVICE_ID,
      };
      const metaEdge = baseEdgeCreated({
        edgeType: 'edge:type:references',
        source: 'node:type:node-type',
        target: 'node:type:edge-type',
      });

      const d1 = decodeStoredEvent(metaNodeCreated, { remapRetiredMetaShapes: false });
      expect(d1.ok).toBe(true);
      if (d1.ok) {
        expect(d1.value).not.toBeNull();
        expect(d1.value?.type === 'NodeCreated' && d1.value.shapeId).toBe(
          asShapeId('node:type:node-type'),
        );
      }

      const d2 = decodeStoredEvent(instanceCreated, { remapRetiredMetaShapes: false });
      expect(d2.ok).toBe(true);
      if (d2.ok && d2.value?.type === 'NodeCreated') {
        expect(d2.value.shapeId).toBe(asShapeId('node:type:edge-type'));
        expect(d2.value.properties.has('entityKind')).toBe(false);
      }

      const d3 = decodeStoredEvent(metaDeleted, { remapRetiredMetaShapes: false });
      expect(d3.ok).toBe(true);
      if (d3.ok) {
        expect(d3.value).not.toBeNull();
      }

      const d4 = decodeStoredEvent(metaEdge, { remapRetiredMetaShapes: false });
      expect(d4.ok).toBe(true);
      if (!(d4.ok && d4.value?.type === 'EdgeCreated')) {
        return;
      }

      expect(d4.value.source).toBe(asNodeId('node:type:node-type'));
      expect(d4.value.target).toBe(asNodeId('node:type:edge-type'));
    });

    it('skips retired meta-node lifecycle events as ok(null) when remapRetiredMetaShapes is true', () => {
      for (const id of ['node:type:node-type', 'node:type:edge-type']) {
        const created = decodeStoredEvent(
          baseNodeCreated({ id, nodeType: 'node:type:node-type' }),
          {
            remapRetiredMetaShapes: true,
          },
        );
        expect(created).toEqual({ ok: true, value: null });

        const updated = decodeStoredEvent(
          {
            type: 'NodePropertiesUpdated',
            eventId: createEventId(),
            id,
            changes: { name: 'Updated' },
            timestamp: TIMESTAMP,
            deviceId: DEVICE_ID,
          },
          { remapRetiredMetaShapes: true },
        );
        expect(updated).toEqual({ ok: true, value: null });

        const deleted = decodeStoredEvent(
          {
            type: 'NodeDeleted',
            eventId: createEventId(),
            id,
            timestamp: TIMESTAMP,
            deviceId: DEVICE_ID,
          },
          { remapRetiredMetaShapes: true },
        );
        expect(deleted).toEqual({ ok: true, value: null });
      }
    });

    it('remaps node:type:node-type and node:type:edge-type instances for plain-object and Map properties without overwriting entityKind', () => {
      const legacyNodeTypePlain = baseNodeCreated({
        nodeType: 'node:type:node-type',
        properties: { name: 'Task' },
      });
      const decodedNodePlain = decodeStoredEvent(legacyNodeTypePlain, {
        remapRetiredMetaShapes: true,
      });
      expect(decodedNodePlain.ok).toBe(true);
      if (decodedNodePlain.ok && decodedNodePlain.value?.type === 'NodeCreated') {
        expect(decodedNodePlain.value.shapeId).toBe(asShapeId('node:type:shape'));
        expect(decodedNodePlain.value.properties.get('entityKind')).toBe('node');
      }

      const modernEdgeTypeMap = baseNodeCreated({
        shapeId: 'node:type:edge-type',
        properties: new Map<string, unknown>([['name', 'LinksTo']]),
      });
      const decodedEdgeMap = decodeStoredEvent(modernEdgeTypeMap, {
        remapRetiredMetaShapes: true,
      });
      expect(decodedEdgeMap.ok).toBe(true);
      if (decodedEdgeMap.ok && decodedEdgeMap.value?.type === 'NodeCreated') {
        expect(decodedEdgeMap.value.shapeId).toBe(asShapeId('node:type:shape'));
        expect(decodedEdgeMap.value.properties.get('entityKind')).toBe('edge');
      }

      // Must NOT overwrite pre-existing entityKind
      const withExistingPlain = baseNodeCreated({
        shapeId: 'node:type:node-type',
        properties: { entityKind: 'edge' },
      });
      const decodedExistingPlain = decodeStoredEvent(withExistingPlain, {
        remapRetiredMetaShapes: true,
      });
      expect(decodedExistingPlain.ok).toBe(true);
      if (decodedExistingPlain.ok && decodedExistingPlain.value?.type === 'NodeCreated') {
        expect(decodedExistingPlain.value.properties.get('entityKind')).toBe('edge');
      }

      const withExistingMap = baseNodeCreated({
        nodeType: 'node:type:edge-type',
        properties: new Map<string, unknown>([['entityKind', 'node']]),
      });
      const decodedExistingMap = decodeStoredEvent(withExistingMap, {
        remapRetiredMetaShapes: true,
      });
      expect(decodedExistingMap.ok).toBe(true);
      if (decodedExistingMap.ok && decodedExistingMap.value?.type === 'NodeCreated') {
        expect(decodedExistingMap.value.properties.get('entityKind')).toBe('node');
      }
    });

    it('remaps retired meta IDs in EdgeCreated source and target when remapRetiredMetaShapes is true', () => {
      const raw = baseEdgeCreated({
        edgeType: 'edge:type:references',
        source: 'node:type:node-type',
        target: 'node:type:edge-type',
      });
      const decoded = decodeStoredEvent(raw, { remapRetiredMetaShapes: true });
      expect(decoded.ok).toBe(true);
      if (!(decoded.ok && decoded.value?.type === 'EdgeCreated')) {
        return;
      }

      expect(decoded.value.source).toBe(asNodeId('node:type:shape'));
      expect(decoded.value.target).toBe(asNodeId('node:type:shape'));
      expect(decoded.value.shapeId).toBe(asShapeId('edge:type:references'));
    });
  });

  describe('property tests', () => {
    const shapeChoices = fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('canopy:open'),
      fc.constant('node:type:node-type'),
      fc.constant('node:type:edge-type'),
      fc.constant('node:type:shape'),
      fc.constant('user:task'),
    );

    const arbitraryStoredEvent = fc.oneof(
      fc
        .record({
          type: fc.constant('NodeCreated'),
          id: fc.string(),
          nodeType: shapeChoices,
          shapeId: shapeChoices,
          useMap: fc.boolean(),
          hasEntityKind: fc.boolean(),
        })
        .map(({ type, id, nodeType, shapeId, useMap, hasEntityKind }) => {
          const entries: readonly (readonly [string, unknown])[] = [
            hasEntityKind ? ['entityKind', 'custom'] : ['title', 'v'],
          ];
          return {
            type,
            eventId: createEventId(),
            id,
            properties: useMap ? new Map(entries) : Object.fromEntries(entries),
            timestamp: TIMESTAMP,
            deviceId: DEVICE_ID,
            ...(nodeType !== undefined && { nodeType }),
            ...(shapeId !== undefined && { shapeId }),
          };
        }),
      fc
        .record({
          type: fc.constant('EdgeCreated'),
          source: fc.oneof(
            fc.constant('node:type:node-type'),
            fc.constant('node:type:edge-type'),
            fc.constant('n1'),
          ),
          target: fc.oneof(
            fc.constant('node:type:node-type'),
            fc.constant('node:type:edge-type'),
            fc.constant('n2'),
          ),
          edgeType: shapeChoices,
          shapeId: shapeChoices,
        })
        .map(({ type, source, target, edgeType, shapeId }) => ({
          type,
          eventId: createEventId(),
          id: 'e1',
          source,
          target,
          properties: {},
          timestamp: TIMESTAMP,
          deviceId: DEVICE_ID,
          ...(edgeType !== undefined && { edgeType }),
          ...(shapeId !== undefined && { shapeId }),
        })),
    );

    it('is idempotent under upcast(upcast(x, opts), opts) for both modes and Map/plain-object properties', () => {
      fc.assert(
        fc.property(arbitraryStoredEvent, fc.boolean(), (event, remapRetiredMetaShapes) => {
          const options = { remapRetiredMetaShapes };
          const once = upcastStoredEvent(event, options);
          const twice = upcastStoredEvent(once, options);
          expect(twice).toEqual(once);
        }),
        { numRuns: 200 },
      );
    });

    it('never throws on arbitrary primitives, arrays, or JSON objects', () => {
      fc.assert(
        fc.property(fc.anything(), fc.boolean(), (raw, remapRetiredMetaShapes) => {
          const options = { remapRetiredMetaShapes };
          expect(() => upcastStoredEvent(raw, options)).not.toThrow();
          expect(() => decodeStoredEvent(raw, options)).not.toThrow();
        }),
        { numRuns: 200 },
      );
    });
  });
});
