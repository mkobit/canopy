import { describe, it, expect } from 'bun:test';
import {
  asEventId,
  createGraphId,
  createNodeId,
  createEdgeId,
  asTypeId,
  asDeviceId,
} from './factories';
import { createGraph } from './create-graph';
import { applyEvent } from './projection';
import { unwrap } from './result';
import { asRevision, zeroRevision, maxRevision, accumulateRevision } from './revision';
import { RevisionSchema } from './schemas';
import type { Graph } from './graph';
import type {
  NodeCreated,
  NodePropertiesUpdated,
  NodeDeleted,
  EdgeCreated,
  EdgePropertiesUpdated,
  EdgeDeleted,
} from './events';
import type { Instant } from './temporal';

const freshGraph = (): Graph => unwrap(createGraph(createGraphId(), 'revision-fold-test'));

describe('revision', () => {
  describe('zeroRevision', () => {
    it('returns a stable sentinel value', () => {
      expect(zeroRevision()).toBe(zeroRevision());
    });

    it('returns the standard zero uuid string', () => {
      expect(zeroRevision()).toBe(asRevision('00000000-0000-0000-0000-000000000000'));
    });

    it('passes schema validation', () => {
      expect(RevisionSchema.safeParse(zeroRevision()).success).toBe(true);
    });

    it('sorts below any real EventId', () => {
      const realEventId = asEventId('018f4d2e-1234-7abc-89ab-cdef01234567');
      expect((zeroRevision() as string) < (realEventId as string)).toBe(true);
    });
  });

  describe('accumulateRevision', () => {
    const eventA = asEventId('018f4d2e-0001-7abc-89ab-cdef01234567');
    const eventB = asEventId('018f4d2e-0002-7abc-89ab-cdef01234567');
    const eventC = asEventId('018f4d2e-0003-7abc-89ab-cdef01234567');
    const eventD = asEventId('018f4d2e-0004-7abc-89ab-cdef01234567');
    const eventE = asEventId('018f4d2e-0005-7abc-89ab-cdef01234567');

    it('single event accumulation advances from zero revision', () => {
      const initial = zeroRevision();
      const next = accumulateRevision(initial, eventA);
      expect(next).not.toBe(initial);
      expect(next).not.toBe(zeroRevision());
    });

    it('permutation invariance holds for two events', () => {
      const initial = zeroRevision();
      const ab = accumulateRevision(accumulateRevision(initial, eventA), eventB);
      const ba = accumulateRevision(accumulateRevision(initial, eventB), eventA);
      expect(ab).toBe(ba);
    });

    it('permutation invariance holds for multi-event sets', () => {
      const initial = zeroRevision();
      const list = [eventA, eventB, eventC, eventD, eventE];

      let forward = initial;
      for (const eventId of list) {
        forward = accumulateRevision(forward, eventId);
      }

      let reversed = initial;
      for (const eventId of list.toReversed()) {
        reversed = accumulateRevision(reversed, eventId);
      }

      let shuffled = initial;
      for (const eventId of [eventC, eventA, eventE, eventB, eventD]) {
        shuffled = accumulateRevision(shuffled, eventId);
      }

      expect(forward).toBe(reversed);
      expect(forward).toBe(shuffled);
    });

    it('produces distinct tokens for subsets', () => {
      const initial = zeroRevision();
      const revA = accumulateRevision(initial, eventA);
      const revB = accumulateRevision(initial, eventB);
      const revAB = accumulateRevision(revA, eventB);
      const revABC = accumulateRevision(revAB, eventC);
      const revAC = accumulateRevision(revA, eventC);

      expect(revA).not.toBe(revAB);
      expect(revB).not.toBe(revAB);
      expect(revA).not.toBe(revB);
      expect(revAB).not.toBe(revABC);
      expect(revAC).not.toBe(revABC);
      expect(revAC).not.toBe(revAB);
    });

    it('advances token on out-of-order event arrival', () => {
      const initial = zeroRevision();
      const highEvent = asEventId('018f4d2e-0099-7abc-89ab-cdef01234567');
      const lowEvent = asEventId('018f4d2e-0010-7abc-89ab-cdef01234567');

      const afterHigh = accumulateRevision(initial, highEvent);
      const afterBoth = accumulateRevision(afterHigh, lowEvent);

      // In contrast to running-max, an older event still advances the token
      expect(afterBoth).not.toBe(afterHigh);

      // And order does not affect final accumulator
      const afterLowFirst = accumulateRevision(accumulateRevision(initial, lowEvent), highEvent);
      expect(afterBoth).toBe(afterLowFirst);
    });

    it('validates format as UUIDv8', () => {
      const initial = zeroRevision();
      const rev = accumulateRevision(initial, eventA);

      // RFC 9562 UUIDv8: 8-4-4-4-12, version 8, variant 10xx (8, 9, a, or b)
      const uuidv8Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(uuidv8Pattern.test(rev as string)).toBe(true);

      const parsed = RevisionSchema.safeParse(rev);
      expect(parsed.success).toBe(true);
    });
  });

  describe('maxRevision', () => {
    it('returns the eventId when it is greater than the current revision', () => {
      const current = zeroRevision();
      const eventId = asEventId('018f4d2e-1234-7abc-89ab-cdef01234567');
      expect(maxRevision(current, eventId)).toBe(asRevision(eventId));
    });

    it('keeps the current revision when it is already greater than the eventId', () => {
      const current = asRevision('018f4d2e-9999-7abc-89ab-cdef01234567');
      const eventId = asEventId('018f4d2e-1234-7abc-89ab-cdef01234567');
      expect(maxRevision(current, eventId)).toBe(current);
    });

    it('is idempotent when the eventId equals the current revision', () => {
      const value = '018f4d2e-1234-7abc-89ab-cdef01234567';
      const current = asRevision(value);
      const eventId = asEventId(value);
      expect(maxRevision(current, eventId)).toBe(current);
    });
  });

  describe('asRevision', () => {
    it('is a trusted cast that returns the input unchanged', () => {
      expect(asRevision('some-opaque-string')).toBe(asRevision('some-opaque-string'));
    });
  });

  describe('createGraph seeding', () => {
    it('seeds a fresh graph with the zero revision sentinel', () => {
      const graph = unwrap(createGraph(createGraphId(), 'seed-test'));
      expect(graph.revision).toBe(zeroRevision());
    });
  });

  describe('applyEvent folds revision using accumulateRevision, per op type', () => {
    const device = asDeviceId('00000000-0000-0000-0000-00000000000a');
    const t: Instant = '2024-01-01T10:00:00.000Z' as Instant;

    it('NodeCreated advances revision to accumulateRevision result', () => {
      const graph = freshGraph();
      const eventId = asEventId('018f4d2e-0001-7abc-89ab-cdef01234567');
      const event: NodeCreated = {
        type: 'NodeCreated',
        eventId,
        id: createNodeId(),
        nodeType: asTypeId('test-type'),
        properties: new Map(),
        timestamp: t,
        deviceId: device,
      };
      const result = unwrap(applyEvent(graph, event));
      expect(result.revision).toBe(accumulateRevision(graph.revision, eventId));
    });

    it('NodePropertiesUpdated advances revision to accumulateRevision result', () => {
      const nodeId = createNodeId();
      const createdEventId = asEventId('018f4d2e-0001-7abc-89ab-cdef01234567');
      const created: NodeCreated = {
        type: 'NodeCreated',
        eventId: createdEventId,
        id: nodeId,
        nodeType: asTypeId('test-type'),
        properties: new Map(),
        timestamp: t,
        deviceId: device,
      };
      const afterCreate = unwrap(applyEvent(freshGraph(), created));

      const updateEventId = asEventId('018f4d2e-0002-7abc-89ab-cdef01234567');
      const updated: NodePropertiesUpdated = {
        type: 'NodePropertiesUpdated',
        eventId: updateEventId,
        id: nodeId,
        changes: new Map([['k', 'v']]),
        timestamp: '2024-01-01T11:00:00.000Z' as Instant,
        deviceId: device,
      };
      const result = unwrap(applyEvent(afterCreate, updated));
      expect(result.revision).toBe(accumulateRevision(afterCreate.revision, updateEventId));
    });

    it('NodeDeleted advances revision to accumulateRevision result', () => {
      const nodeId = createNodeId();
      const created: NodeCreated = {
        type: 'NodeCreated',
        eventId: asEventId('018f4d2e-0001-7abc-89ab-cdef01234567'),
        id: nodeId,
        nodeType: asTypeId('test-type'),
        properties: new Map(),
        timestamp: t,
        deviceId: device,
      };
      const afterCreate = unwrap(applyEvent(freshGraph(), created));

      const deleteEventId = asEventId('018f4d2e-0002-7abc-89ab-cdef01234567');
      const deleted: NodeDeleted = {
        type: 'NodeDeleted',
        eventId: deleteEventId,
        id: nodeId,
        timestamp: '2024-01-01T11:00:00.000Z' as Instant,
        deviceId: device,
      };
      const result = unwrap(applyEvent(afterCreate, deleted));
      expect(result.revision).toBe(accumulateRevision(afterCreate.revision, deleteEventId));
    });

    it('EdgeCreated advances revision to accumulateRevision result', () => {
      const sourceId = createNodeId();
      const targetId = createNodeId();
      const withNodes = unwrap(
        applyEvent(
          unwrap(
            applyEvent(freshGraph(), {
              type: 'NodeCreated',
              eventId: asEventId('018f4d2e-0001-7abc-89ab-cdef01234567'),
              id: sourceId,
              nodeType: asTypeId('test-type'),
              properties: new Map(),
              timestamp: t,
              deviceId: device,
            } satisfies NodeCreated),
          ),
          {
            type: 'NodeCreated',
            eventId: asEventId('018f4d2e-0002-7abc-89ab-cdef01234567'),
            id: targetId,
            nodeType: asTypeId('test-type'),
            properties: new Map(),
            timestamp: t,
            deviceId: device,
          } satisfies NodeCreated,
        ),
      );

      const edgeEventId = asEventId('018f4d2e-0003-7abc-89ab-cdef01234567');
      const edgeCreated: EdgeCreated = {
        type: 'EdgeCreated',
        eventId: edgeEventId,
        id: createEdgeId(),
        edgeType: asTypeId('test-edge-type'),
        source: sourceId,
        target: targetId,
        properties: new Map(),
        timestamp: '2024-01-01T11:00:00.000Z' as Instant,
        deviceId: device,
      };
      const result = unwrap(applyEvent(withNodes, edgeCreated));
      expect(result.revision).toBe(accumulateRevision(withNodes.revision, edgeEventId));
    });

    it('EdgePropertiesUpdated advances revision to accumulateRevision result', () => {
      const sourceId = createNodeId();
      const targetId = createNodeId();
      const edgeId = createEdgeId();
      let graph = freshGraph();
      graph = unwrap(
        applyEvent(graph, {
          type: 'NodeCreated',
          eventId: asEventId('018f4d2e-0001-7abc-89ab-cdef01234567'),
          id: sourceId,
          nodeType: asTypeId('test-type'),
          properties: new Map(),
          timestamp: t,
          deviceId: device,
        } satisfies NodeCreated),
      );
      graph = unwrap(
        applyEvent(graph, {
          type: 'NodeCreated',
          eventId: asEventId('018f4d2e-0002-7abc-89ab-cdef01234567'),
          id: targetId,
          nodeType: asTypeId('test-type'),
          properties: new Map(),
          timestamp: t,
          deviceId: device,
        } satisfies NodeCreated),
      );
      graph = unwrap(
        applyEvent(graph, {
          type: 'EdgeCreated',
          eventId: asEventId('018f4d2e-0003-7abc-89ab-cdef01234567'),
          id: edgeId,
          edgeType: asTypeId('test-edge-type'),
          source: sourceId,
          target: targetId,
          properties: new Map(),
          timestamp: t,
          deviceId: device,
        } satisfies EdgeCreated),
      );

      const updateEventId = asEventId('018f4d2e-0004-7abc-89ab-cdef01234567');
      const updated: EdgePropertiesUpdated = {
        type: 'EdgePropertiesUpdated',
        eventId: updateEventId,
        id: edgeId,
        changes: new Map([['k', 'v']]),
        timestamp: '2024-01-01T11:00:00.000Z' as Instant,
        deviceId: device,
      };
      const result = unwrap(applyEvent(graph, updated));
      expect(result.revision).toBe(accumulateRevision(graph.revision, updateEventId));
    });

    it('EdgeDeleted advances revision to accumulateRevision result', () => {
      const sourceId = createNodeId();
      const targetId = createNodeId();
      const edgeId = createEdgeId();
      let graph = freshGraph();
      graph = unwrap(
        applyEvent(graph, {
          type: 'NodeCreated',
          eventId: asEventId('018f4d2e-0001-7abc-89ab-cdef01234567'),
          id: sourceId,
          nodeType: asTypeId('test-type'),
          properties: new Map(),
          timestamp: t,
          deviceId: device,
        } satisfies NodeCreated),
      );
      graph = unwrap(
        applyEvent(graph, {
          type: 'NodeCreated',
          eventId: asEventId('018f4d2e-0002-7abc-89ab-cdef01234567'),
          id: targetId,
          nodeType: asTypeId('test-type'),
          properties: new Map(),
          timestamp: t,
          deviceId: device,
        } satisfies NodeCreated),
      );
      graph = unwrap(
        applyEvent(graph, {
          type: 'EdgeCreated',
          eventId: asEventId('018f4d2e-0003-7abc-89ab-cdef01234567'),
          id: edgeId,
          edgeType: asTypeId('test-edge-type'),
          source: sourceId,
          target: targetId,
          properties: new Map(),
          timestamp: t,
          deviceId: device,
        } satisfies EdgeCreated),
      );

      const deleteEventId = asEventId('018f4d2e-0004-7abc-89ab-cdef01234567');
      const deleted: EdgeDeleted = {
        type: 'EdgeDeleted',
        eventId: deleteEventId,
        id: edgeId,
        timestamp: '2024-01-01T11:00:00.000Z' as Instant,
        deviceId: device,
      };
      const result = unwrap(applyEvent(graph, deleted));
      expect(result.revision).toBe(accumulateRevision(graph.revision, deleteEventId));
    });

    it('a lower-eventId write applied out of order still advances revision', () => {
      const nodeId = createNodeId();
      const created: NodeCreated = {
        type: 'NodeCreated',
        eventId: asEventId('018f4d2e-0001-7abc-89ab-cdef01234567'),
        id: nodeId,
        nodeType: asTypeId('test-type'),
        properties: new Map(),
        timestamp: t,
        deviceId: device,
      };
      const afterCreate = unwrap(applyEvent(freshGraph(), created));

      const highEventId = asEventId('018f4d2e-0099-7abc-89ab-cdef01234567');
      const highUpdate: NodePropertiesUpdated = {
        type: 'NodePropertiesUpdated',
        eventId: highEventId,
        id: nodeId,
        changes: new Map([['k', 'high']]),
        timestamp: '2024-01-01T12:00:00.000Z' as Instant,
        deviceId: device,
      };
      const afterHigh = unwrap(applyEvent(afterCreate, highUpdate));
      expect(afterHigh.revision).toBe(accumulateRevision(afterCreate.revision, highEventId));

      // Same timestamp/device shape but a lower eventId, applied out of order.
      const lowEventId = asEventId('018f4d2e-0050-7abc-89ab-cdef01234567');
      const lowUpdate: NodePropertiesUpdated = {
        type: 'NodePropertiesUpdated',
        eventId: lowEventId,
        id: nodeId,
        changes: new Map([['k', 'low']]),
        timestamp: '2024-01-01T13:00:00.000Z' as Instant,
        deviceId: device,
      };
      const afterLow = unwrap(applyEvent(afterHigh, lowUpdate));

      // The accumulator advances even though lowEventId < highEventId
      expect(afterLow.revision).not.toBe(afterHigh.revision);
      expect(afterLow.revision).toBe(accumulateRevision(afterHigh.revision, lowEventId));
    });
  });

  describe('same-millisecond regression (the bug this change fixes)', () => {
    it('two commits sharing a wall-clock timestamp still produce distinct revisions', () => {
      const device = asDeviceId('00000000-0000-0000-0000-00000000000a');
      const sameTimestamp: Instant = '2024-01-01T10:00:00.000Z' as Instant;
      const nodeId = createNodeId();

      const created: NodeCreated = {
        type: 'NodeCreated',
        eventId: asEventId('018f4d2e-0001-7abc-89ab-cdef01234567'),
        id: nodeId,
        nodeType: asTypeId('test-type'),
        properties: new Map(),
        timestamp: sameTimestamp,
        deviceId: device,
      };
      const graph = unwrap(applyEvent(unwrap(createGraph(createGraphId(), 'ts-test')), created));

      const firstUpdateEventId = asEventId('018f4d2e-0002-7abc-89ab-cdef01234567');
      const firstUpdate: NodePropertiesUpdated = {
        type: 'NodePropertiesUpdated',
        eventId: firstUpdateEventId,
        id: nodeId,
        changes: new Map([['k', 'first']]),
        timestamp: sameTimestamp,
        deviceId: device,
      };
      const afterFirst = unwrap(applyEvent(graph, firstUpdate));

      const secondUpdateEventId = asEventId('018f4d2e-0003-7abc-89ab-cdef01234567');
      const secondUpdate: NodePropertiesUpdated = {
        type: 'NodePropertiesUpdated',
        eventId: secondUpdateEventId,
        id: nodeId,
        changes: new Map([['k', 'second']]),
        timestamp: sameTimestamp,
        deviceId: device,
      };
      const afterSecond = unwrap(applyEvent(afterFirst, secondUpdate));

      // The pre-existing bug: metadata.modified does NOT advance on the second
      // event, since event.timestamp > graph.metadata.modified is false when
      // the timestamps are identical -- this is exactly why the old token
      // (metadata.modified) could collide and let a stale draft commit pass.
      expect(afterSecond.metadata.modified).toBe(afterFirst.metadata.modified);

      // The fix: revision is derived from eventId, not timestamp, so it still
      // advances and distinguishes the two states.
      expect(afterSecond.revision).not.toBe(afterFirst.revision);
      expect(afterSecond.revision).toBe(
        accumulateRevision(afterFirst.revision, secondUpdateEventId),
      );
    });
  });
});
