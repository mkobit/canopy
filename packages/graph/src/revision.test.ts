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
import { asRevision, zeroRevision, maxRevision } from './revision';
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

describe('revision', () => {
  describe('zeroRevision', () => {
    it('returns a stable sentinel value', () => {
      expect(zeroRevision()).toBe(zeroRevision());
    });

    it('sorts below any real EventId', () => {
      const realEventId = asEventId('018f4d2e-1234-7abc-89ab-cdef01234567');
      expect((zeroRevision() as string) < (realEventId as string)).toBe(true);
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

  describe('applyEvent folds revision to the eventId, per op type', () => {
    const device = asDeviceId('00000000-0000-0000-0000-00000000000a');
    const t: Instant = '2024-01-01T10:00:00.000Z' as Instant;

    const freshGraph = (): Graph => unwrap(createGraph(createGraphId(), 'revision-fold-test'));

    it('NodeCreated advances revision to its eventId', () => {
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
      expect(result.revision).toBe(asRevision(eventId));
    });

    it('NodePropertiesUpdated advances revision to its eventId', () => {
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
      expect(result.revision).toBe(asRevision(updateEventId));
    });

    it('NodeDeleted advances revision to its eventId', () => {
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
      expect(result.revision).toBe(asRevision(deleteEventId));
    });

    it('EdgeCreated advances revision to its eventId', () => {
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
      expect(result.revision).toBe(asRevision(edgeEventId));
    });

    it('EdgePropertiesUpdated advances revision to its eventId', () => {
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
      expect(result.revision).toBe(asRevision(updateEventId));
    });

    it('EdgeDeleted advances revision to its eventId', () => {
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
      expect(result.revision).toBe(asRevision(deleteEventId));
    });

    it('a lower-eventId write applied after a higher one does not lower revision', () => {
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
      expect(afterHigh.revision).toBe(asRevision(highEventId));

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
      expect(afterLow.revision).toBe(asRevision(highEventId));
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
      expect(afterSecond.revision).toBe(asRevision(secondUpdateEventId));
    });
  });
});
