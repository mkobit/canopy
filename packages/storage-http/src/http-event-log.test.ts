import { describe, it, expect, beforeEach } from 'bun:test';
import { createHTTPEventLog } from './http-event-log';
import type { HTTPEventLog } from './http-event-log';
import { unwrap, asNodeId, asTypeId, asEventId, asInstant, asDeviceId } from '@canopy/graph';
import type { NodeCreated, GraphEvent } from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';

const mockGraphId = 'test-graph-id';

const createEvent = (i: number): NodeCreated => ({
  type: 'NodeCreated',
  eventId: asEventId(`018d9${i.toString().padStart(3, '0')}-0000-7000-8000-000000000000`),
  id: asNodeId(`node-${i}`),
  nodeType: asTypeId('test-type'),
  properties: new Map([['name', `Node ${i}`]]),
  timestamp: asInstant(
    Temporal.Instant.from(`2024-01-01T10:${String(i).padStart(2, '0')}:00.000Z`).toString(),
  ),
  deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
});

interface SerializedEvent {
  readonly eventId: string;
  readonly type: string;
  readonly [key: string]: unknown;
}

describe('HTTPEventLog', () => {
  let mockDb: Map<string, readonly SerializedEvent[]>;
  let adapter: HTTPEventLog;

  const mockFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split('/');
    const graphId = pathParts[pathParts.indexOf('graphs') + 1];
    if (!graphId) {
      return new Response('Not Found', { status: 404 });
    }

    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as {
        readonly events: readonly SerializedEvent[];
      };
      const events = body.events;
      if (!Array.isArray(events)) {
        return new Response('Bad Request', { status: 400 });
      }

      const current = mockDb.get(graphId) ?? [];
      const existingIds = new Set(current.map((e) => e.eventId));
      const newEvents = events.filter((e) => !existingIds.has(e.eventId));
      mockDb.set(graphId, [...current, ...newEvents]);

      return Response.json({ ok: true });
    }

    if (init?.method === 'GET') {
      let events = mockDb.get(graphId) ?? [];

      const after = parsedUrl.searchParams.get('after');
      const before = parsedUrl.searchParams.get('before');
      const limitStr = parsedUrl.searchParams.get('limit');
      const reverseStr = parsedUrl.searchParams.get('reverse');

      if (after) {
        events = events.filter((e) => e.eventId > after);
      }
      if (before) {
        events = events.filter((e) => e.eventId < before);
      }
      if (reverseStr === 'true') {
        events = events.toReversed();
      }
      if (limitStr) {
        events = events.slice(0, Number(limitStr));
      }

      return Response.json({ events });
    }

    return new Response('Method Not Allowed', { status: 405 });
  };

  beforeEach(() => {
    mockDb = new Map();
    adapter = createHTTPEventLog('http://localhost:3000', {
      fetch: mockFetch,
    });
  });

  it('should append and get events with Map deserialization', async () => {
    const events: GraphEvent[] = [createEvent(1), createEvent(2)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId));
    expect(result).toHaveLength(2);
    const [res1, res2] = result;
    const [evt1, evt2] = events;
    expect(res1?.eventId).toEqual(evt1?.eventId);
    expect(res1?.properties).toBeInstanceOf(Map);
    expect(res1?.properties.get('name')).toEqual('Node 1');
    expect(res2?.eventId).toEqual(evt2?.eventId);
    expect(res2?.properties.get('name')).toEqual('Node 2');
  });

  it('should filter by after (incremental sync)', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { after: events[0]?.eventId }));
    expect(result).toHaveLength(2);
    const [res1, res2] = result;
    const [, evt2, evt3] = events;
    expect(res1?.eventId).toEqual(evt2?.eventId);
    expect(res2?.eventId).toEqual(evt3?.eventId);
  });

  it('should filter by before', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { before: events[2]?.eventId }));
    expect(result).toHaveLength(2);
    const [res1, res2] = result;
    const [evt1, evt2] = events;
    expect(res1?.eventId).toEqual(evt1?.eventId);
    expect(res2?.eventId).toEqual(evt2?.eventId);
  });

  it('should respect limit', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { limit: 2 }));
    expect(result).toHaveLength(2);
    const [res1, res2] = result;
    const [evt1, evt2] = events;
    expect(res1?.eventId).toEqual(evt1?.eventId);
    expect(res2?.eventId).toEqual(evt2?.eventId);
  });

  it('should sort reverse', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { reverse: true }));
    expect(result).toHaveLength(3);
    const [res1, res2, res3] = result;
    const [evt1, evt2, evt3] = events;
    expect(res1?.eventId).toEqual(evt3?.eventId);
    expect(res2?.eventId).toEqual(evt2?.eventId);
    expect(res3?.eventId).toEqual(evt1?.eventId);
  });

  it('should ignore duplicate events', async () => {
    const event = createEvent(1);
    await unwrap(await adapter.appendEvents(mockGraphId, [event]));
    await unwrap(await adapter.appendEvents(mockGraphId, [event]));

    const result = unwrap(await adapter.getEvents(mockGraphId));
    expect(result).toHaveLength(1);
  });

  it('should return error Result when server returns non-2xx status code', async () => {
    const errorAdapter = createHTTPEventLog('http://localhost:3000', {
      fetch: async () => new Response('Internal Server Error', { status: 500 }),
    });

    const appendRes = await errorAdapter.appendEvents(mockGraphId, [createEvent(1)]);
    expect(appendRes.ok).toBe(false);
    if (!appendRes.ok) {
      expect(appendRes.error.message).toContain('500');
    }

    const getRes = await errorAdapter.getEvents(mockGraphId);
    expect(getRes.ok).toBe(false);
    if (!getRes.ok) {
      expect(getRes.error.message).toContain('500');
    }
  });
});
