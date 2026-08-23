import { describe, it, expect, beforeEach } from 'bun:test';
import { createHTTPEventLog } from './http-event-log';
import type { HTTPEventLog } from './http-event-log';
import { unwrap, asNodeId, asTypeId, asEventId, asInstant, asDeviceId } from '@canopy/graph';
import type { NodeCreated, GraphEvent } from '@canopy/graph';

const mockGraphId = 'test-graph-id';

const createEvent = (index: number): NodeCreated => ({
  type: 'NodeCreated',
  eventId: asEventId(`018d9${index.toString().padStart(3, '0')}-0000-7000-8000-000000000000`),
  id: asNodeId(`node-${index}`),
  nodeType: asTypeId('test-type'),
  properties: new Map([['name', `Node ${index}`]]),
  timestamp: asInstant(
    Temporal.Instant.from(`2024-01-01T10:${String(index).padStart(2, '0')}:00.000Z`).toString(),
  ),
  deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
});

interface SerializedEvent {
  readonly eventId: string;
  readonly type: string;
  readonly [key: string]: unknown;
}

describe('HTTPEventLog', () => {
  let mockDatabase: Map<string, readonly SerializedEvent[]>;
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

      const current = mockDatabase.get(graphId) ?? [];
      const existingIds = new Set(current.map((event) => event.eventId));
      const newEvents = events.filter((event) => !existingIds.has(event.eventId));
      mockDatabase.set(graphId, [...current, ...newEvents]);

      return Response.json({ ok: true });
    }

    if (init?.method === 'GET') {
      let events = mockDatabase.get(graphId) ?? [];

      const after = parsedUrl.searchParams.get('after');
      const before = parsedUrl.searchParams.get('before');
      const limitString = parsedUrl.searchParams.get('limit');
      const reverseString = parsedUrl.searchParams.get('reverse');

      if (after) {
        events = events.filter((event) => event.eventId > after);
      }
      if (before) {
        events = events.filter((event) => event.eventId < before);
      }
      if (reverseString === 'true') {
        events = events.toReversed();
      }
      if (limitString) {
        events = events.slice(0, Number(limitString));
      }

      return Response.json({ events });
    }

    return new Response('Method Not Allowed', { status: 405 });
  };

  beforeEach(() => {
    mockDatabase = new Map();
    adapter = createHTTPEventLog('http://localhost:3000', {
      fetch: mockFetch as unknown as typeof fetch,
    });
  });

  it('should append and get events with Map deserialization', async () => {
    const events: GraphEvent[] = [createEvent(1), createEvent(2)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId));
    expect(result).toHaveLength(2);
    const [result1, result2] = result;
    if (result1?.type !== 'NodeCreated' || result2?.type !== 'NodeCreated') {
      throw new Error('Expected NodeCreated events');
    }
    const [event1, event2] = events;
    if (event1 === undefined || event2 === undefined) {
      throw new Error('Expected events to be defined');
    }
    expect(result1.eventId).toEqual(event1.eventId);
    expect(result1.properties).toBeInstanceOf(Map);
    expect(result1.properties.get('name')).toEqual('Node 1');
    expect(result2.eventId).toEqual(event2.eventId);
    expect(result2.properties.get('name')).toEqual('Node 2');
  });

  it('should filter by after (incremental sync)', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const firstEvent = events[0];
    if (firstEvent === undefined) throw new Error('Expected event');
    const result = unwrap(await adapter.getEvents(mockGraphId, { after: firstEvent.eventId }));
    expect(result).toHaveLength(2);
    const [result1, result2] = result;
    const [, event2, event3] = events;
    if (event2 === undefined || event3 === undefined) {
      throw new Error('Expected events to be defined');
    }
    expect(result1?.eventId).toEqual(event2.eventId);
    expect(result2?.eventId).toEqual(event3.eventId);
  });

  it('should filter by before', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const thirdEvent = events[2];
    if (thirdEvent === undefined) throw new Error('Expected event');
    const result = unwrap(await adapter.getEvents(mockGraphId, { before: thirdEvent.eventId }));
    expect(result).toHaveLength(2);
    const [result1, result2] = result;
    const [event1, event2] = events;
    if (event1 === undefined || event2 === undefined) {
      throw new Error('Expected events to be defined');
    }
    expect(result1?.eventId).toEqual(event1.eventId);
    expect(result2?.eventId).toEqual(event2.eventId);
  });

  it('should respect limit', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { limit: 2 }));
    expect(result).toHaveLength(2);
    const [result1, result2] = result;
    const [event1, event2] = events;
    if (event1 === undefined || event2 === undefined) {
      throw new Error('Expected events to be defined');
    }
    expect(result1?.eventId).toEqual(event1.eventId);
    expect(result2?.eventId).toEqual(event2.eventId);
  });

  it('should sort reverse', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { reverse: true }));
    expect(result).toHaveLength(3);
    const [result1, result2, result3] = result;
    const [event1, event2, event3] = events;
    if (!event1 || !event2 || !event3) {
      throw new Error('Expected events to be defined');
    }
    expect(result1?.eventId).toEqual(event3.eventId);
    expect(result2?.eventId).toEqual(event2.eventId);
    expect(result3?.eventId).toEqual(event1.eventId);
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
      fetch: (async () =>
        new Response('Internal Server Error', { status: 500 })) as unknown as typeof fetch,
    });

    const appendResult = await errorAdapter.appendEvents(mockGraphId, [createEvent(1)]);
    expect(appendResult.ok).toBe(false);
    if (!appendResult.ok) {
      expect(appendResult.error.message).toContain('500');
    }

    const getResult = await errorAdapter.getEvents(mockGraphId);
    expect(getResult.ok).toBe(false);
    if (!getResult.ok) {
      expect(getResult.error.message).toContain('500');
    }
  });
});
