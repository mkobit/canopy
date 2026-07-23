import { describe, expect, it } from 'bun:test';
import {
  asDeviceId,
  asGraphId,
  asNodeId,
  asTypeId,
  createGraphSession,
} from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import {
  createApiAdapterContext,
  createApiRequest,
  createEventStreamSubscriber,
  executeCreateNode,
} from '../src';
import type { EventStreamMessage } from '../src/api-payloads';

const graphId = asGraphId('g1');
const deviceId = asDeviceId('device-1');

const setupSessionContext = async () => {
  const eventLogStore = createInMemoryEventStore();
  const session = createGraphSession(eventLogStore, graphId, deviceId);
  await session.load();
  const context = createApiAdapterContext({ graph: session.graph(), session });
  return { session, context };
};

describe('Real-Time Event Stream Subscriber', () => {
  it('broadcasts live committed events to active stream listeners', async () => {
    const { context } = await setupSessionContext();
    const subscriber = createEventStreamSubscriber(context);
    const messages: EventStreamMessage[] = [];

    const unsubscribe = subscriber.subscribe((msg) => {
      messages.push(msg);
    });

    const req = createApiRequest('req-1', context, {
      id: asNodeId('n1'),
      type: asTypeId('doc'),
      properties: { title: 'Live Streaming Node' },
    });
    const res = await executeCreateNode(req);
    expect(res.ok).toBe(true);

    expect(messages.length).toBeGreaterThanOrEqual(1);
    const eventMsg = messages.find((m) => m.kind === 'event');
    expect(eventMsg).toBeDefined();
    if (eventMsg && eventMsg.kind === 'event') {
      expect(eventMsg.event.type).toBe('NodeCreated');
      expect(eventMsg.event.id).toBe(asNodeId('n1'));
    }

    unsubscribe();
    subscriber.close();
  });

  it('enforces buffer capacity backpressure and disconnects subscriber on overflow', async () => {
    const { context } = await setupSessionContext();
    const subscriber = createEventStreamSubscriber(context, { bufferCapacity: 2 });
    const messages: EventStreamMessage[] = [];

    subscriber.subscribe((msg) => {
      messages.push(msg);
    });

    for (let i = 1; i <= 5; i++) {
      const req = createApiRequest(`req-overflow-${i}`, context, {
        id: asNodeId(`n-overflow-${i}`),
        type: asTypeId('doc'),
        properties: { count: i },
      });
      await executeCreateNode(req);
    }

    const overflowMsg = messages.find((m) => m.kind === 'overflow_disconnect');
    expect(overflowMsg).toBeDefined();
    if (overflowMsg && overflowMsg.kind === 'overflow_disconnect') {
      expect(overflowMsg.reason).toContain('capacity of 2 exceeded');
    }

    expect(subscriber.isClosed()).toBe(true);
  });
});
