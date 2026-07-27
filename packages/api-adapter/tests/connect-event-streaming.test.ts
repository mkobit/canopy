import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, asNodeId, asTypeId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import {
  createApiAdapterContext,
  createApiRequest,
  createConnectEventStreamHandlers,
  executeCreateNode,
} from '../src';

const graphId = asGraphId('g1');
const deviceId = asDeviceId('device-1');

const setupSessionContext = async () => {
  const eventLogStore = createInMemoryEventStore();
  const session = createGraphSession(eventLogStore, graphId, deviceId);
  await session.load();
  const context = createApiAdapterContext({
    graph: session.graph(),
    session,
    eventLogStore,
  });
  return { session, context, eventLogStore };
};

describe('Connect gRPC event log streaming and replay handlers', () => {
  it('streams live committed events as ConnectEventStreamItem via subscribeEventStream iterator', async () => {
    const { context } = await setupSessionContext();
    const handlers = createConnectEventStreamHandlers(context);

    const iterator = handlers.subscribeEventStream({});
    const nextPromise = iterator.next();

    const request = createApiRequest('req-live-1', context, {
      id: asNodeId('n-live-1'),
      type: asTypeId('doc'),
      properties: { title: 'Live Streaming Test' },
    });
    const res = await executeCreateNode(request);
    expect(res.ok).toBe(true);

    const nextResult = await nextPromise;
    expect(nextResult.done).toBe(false);
    expect(nextResult.value).toBeDefined();

    if (nextResult.value) {
      expect(nextResult.value.event_type).toBe('NodeCreated');
      expect(nextResult.value.payload_json).toContain('Live Streaming Test');
      expect(nextResult.value.event_id).toBeDefined();
      expect(typeof nextResult.value.sequence_number).toBe('number');
      expect(nextResult.value.timestamp).toBeDefined();
    }

    if (iterator.return) {
      await iterator.return();
    }
  });

  it('replays unacknowledged events from EventLogStore as ConnectEventStreamItem via replayEventStream iterator', async () => {
    const { context, eventLogStore } = await setupSessionContext();
    const handlers = createConnectEventStreamHandlers(context);

    for (let index = 1; index <= 3; index++) {
      const request = createApiRequest(`req-replay-${index}`, context, {
        id: asNodeId(`n-replay-${index}`),
        type: asTypeId('doc'),
        properties: { count: index },
      });
      const res = await executeCreateNode(request);
      expect(res.ok).toBe(true);
    }

    const allEventsRes = await eventLogStore.getEvents(graphId);
    expect(allEventsRes.ok).toBe(true);
    const allEvents = allEventsRes.ok ? allEventsRes.value : [];
    const firstEventId = allEvents[0]?.eventId ?? '';

    const replayIterator = handlers.replayEventStream({
      last_seen_event_id: firstEventId,
    });

    const items = await Array.fromAsync(replayIterator);

    expect(items).toHaveLength(2);
    expect(items[0]?.event_type).toBe('NodeCreated');
    expect(items[0]?.payload_json).toContain('n-replay-2');
    expect(items[1]?.event_type).toBe('NodeCreated');
    expect(items[1]?.payload_json).toContain('n-replay-3');
  });

  it('yields gap item when replay exceeds maximum requested count threshold', async () => {
    const { context } = await setupSessionContext();
    const handlers = createConnectEventStreamHandlers(context);

    for (let index = 1; index <= 6; index++) {
      const request = createApiRequest(`req-overflow-${index}`, context, {
        id: asNodeId(`n-overflow-${index}`),
        type: asTypeId('doc'),
        properties: { count: index },
      });
      await executeCreateNode(request);
    }

    const replayIterator = handlers.replayEventStream({
      last_seen_event_id: '00000000-0000-0000-0000-000000000000',
      max_replay_count: 3,
    });

    const items = await Array.fromAsync(replayIterator);

    expect(items).toHaveLength(1);
    expect(items[0]?.event_type).toBe('GAP_NOTIFIED');
    expect(items[0]?.payload_json).toContain('exceeds maximum replay threshold');
  });
});
