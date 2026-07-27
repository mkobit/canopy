import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, asNodeId, asTypeId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import {
  createApiAdapterContext,
  createApiRequest,
  createEventStreamSubscriber,
  executeCreateNode,
  executeReplayEventStream,
} from '../src';
import type { EventStreamMessage } from '../src/api-payloads';

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

describe('Real-Time Event Stream Subscriber', () => {
  it('broadcasts live committed events to active stream listeners', async () => {
    const { context } = await setupSessionContext();
    const subscriber = createEventStreamSubscriber(context);
    const messages: EventStreamMessage[] = [];

    const unsubscribe = subscriber.subscribe((message) => {
      messages.push(message);
    });

    const request = createApiRequest('req-1', context, {
      id: asNodeId('n1'),
      type: asTypeId('doc'),
      properties: { title: 'Live Streaming Node' },
    });
    const res = await executeCreateNode(request);
    expect(res.ok).toBe(true);

    expect(messages.length).toBeGreaterThanOrEqual(1);
    const eventMessage = messages.find((m) => m.kind === 'event');
    expect(eventMessage).toBeDefined();
    if (
      eventMessage &&
      eventMessage.kind === 'event' &&
      eventMessage.event?.type === 'NodeCreated'
    ) {
      expect(eventMessage.event.id).toBe(asNodeId('n1'));
    }

    unsubscribe();
    subscriber.close();
  });

  it('enforces buffer capacity backpressure and disconnects subscriber on overflow', async () => {
    const { context } = await setupSessionContext();
    const subscriber = createEventStreamSubscriber(context, { bufferCapacity: 2 });
    const messages: EventStreamMessage[] = [];

    subscriber.subscribe((message) => {
      messages.push(message);
    });

    for (let index = 1; index <= 5; index++) {
      const request = createApiRequest(`req-overflow-${index}`, context, {
        id: asNodeId(`n-overflow-${index}`),
        type: asTypeId('doc'),
        properties: { count: index },
      });
      await executeCreateNode(request);
    }

    const overflowMessage = messages.find((m) => m.kind === 'overflow_disconnect');
    expect(overflowMessage).toBeDefined();
    if (overflowMessage && overflowMessage.kind === 'overflow_disconnect') {
      expect(overflowMessage.reason).toContain('capacity of 2 exceeded');
    }

    expect(subscriber.isClosed()).toBe(true);
  });
});

describe('Event Catch-Up Replay Handler', () => {
  it('replays unacknowledged events from EventLogStore after lastSeenEventId', async () => {
    const { context, eventLogStore } = await setupSessionContext();
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

    const replayRes = await executeReplayEventStream(context, {
      tenantId: context.authContext?.tenantId ?? '',
      graphId: 'g1',
      lastSeenEventId: firstEventId,
    });

    expect(replayRes.ok).toBe(true);
    if (replayRes.ok) {
      expect(replayRes.value).toHaveLength(2);
      expect(replayRes.value[0]?.kind).toBe('event');
      const firstEvent = replayRes.value[0]?.event;
      const secondEvent = replayRes.value[1]?.event;
      if (firstEvent?.type === 'NodeCreated' && secondEvent?.type === 'NodeCreated') {
        expect(firstEvent.id).toBe(asNodeId('n-replay-2'));
        expect(secondEvent.id).toBe(asNodeId('n-replay-3'));
      }
    }
  });

  it('emits gap notification when requested replay count exceeds maxReplayCount limit', async () => {
    const { context } = await setupSessionContext();
    for (let index = 1; index <= 15; index++) {
      const request = createApiRequest(`req-limit-${index}`, context, {
        id: asNodeId(`n-limit-${index}`),
        type: asTypeId('doc'),
        properties: { count: index },
      });
      await executeCreateNode(request);
    }

    const replayRes = await executeReplayEventStream(context, {
      tenantId: context.authContext?.tenantId ?? '',
      graphId: 'g1',
      lastSeenEventId: '00000000-0000-0000-0000-000000000000',
      maxReplayCount: 5,
    });

    expect(replayRes.ok).toBe(true);
    if (replayRes.ok) {
      expect(replayRes.value).toHaveLength(1);
      expect(replayRes.value[0]?.kind).toBe('gap');
      expect(replayRes.value[0]?.reason).toContain('exceeds maximum replay threshold of 5');
    }
  });

  it('rejects replay request if tenant boundary validation fails', async () => {
    const { context, eventLogStore } = await setupSessionContext();
    const contextWithTenant = createApiAdapterContext({
      graph: context.graph,
      ...(context.session && { session: context.session }),
      eventLogStore,
      authContext: { tenantId: 'tenant-a' },
    });

    const replayRes = await executeReplayEventStream(contextWithTenant, {
      tenantId: 'tenant-b',
      graphId: 'g1',
      lastSeenEventId: 'evt-0',
    });

    expect(replayRes.ok).toBe(false);
    if (!replayRes.ok) {
      expect(replayRes.error.category).toBe('FORBIDDEN');
    }
  });
});
