import { describe, expect, test, mock } from 'bun:test';
import { createEventBus } from './event-bus';
import type { GraphEvent } from '@canopy/types';
import {
  createNodeId,
  createEventId,
  createInstant,
  createDeviceId,
  asTypeId,
} from '@canopy/types';

describe('createEventBus', () => {
  const mockEvent: GraphEvent = {
    type: 'NodeCreated',
    eventId: createEventId(),
    id: createNodeId(),
    nodeType: asTypeId('test'),
    properties: new Map(),
    timestamp: createInstant(),
    deviceId: createDeviceId(),
  };

  test('subscribing and receiving emitted events', () => {
    const bus = createEventBus();
    const handler = mock();

    bus.subscribe(handler);
    bus.emit([mockEvent]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([mockEvent]);
  });

  test('unsubscribing stops future notifications', () => {
    const bus = createEventBus();
    const handler = mock();

    const unsubscribe = bus.subscribe(handler);
    bus.emit([mockEvent]);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.emit([mockEvent]);
    expect(handler).toHaveBeenCalledTimes(1); // Still 1, didn't increase
  });

  test('multiple subscribers all receive the same events', () => {
    const bus = createEventBus();
    const handler1 = mock();
    const handler2 = mock();

    bus.subscribe(handler1);
    bus.subscribe(handler2);
    bus.emit([mockEvent]);

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith([mockEvent]);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith([mockEvent]);
  });

  test('subscriberCount reflects current subscriber count', () => {
    const bus = createEventBus();
    expect(bus.subscriberCount()).toBe(0);

    const handler1 = mock();
    const handler2 = mock();

    const unsub1 = bus.subscribe(handler1);
    expect(bus.subscriberCount()).toBe(1);

    const unsub2 = bus.subscribe(handler2);
    expect(bus.subscriberCount()).toBe(2);

    unsub1();
    expect(bus.subscriberCount()).toBe(1);

    unsub2();
    expect(bus.subscriberCount()).toBe(0);
  });

  test('emitting with zero subscribers does not throw', () => {
    const bus = createEventBus();
    expect(() => bus.emit([mockEvent])).not.toThrow();
  });

  test('the same handler can be subscribed multiple times and each subscription is independent', () => {
    const bus = createEventBus();
    const handler = mock();

    const unsub1 = bus.subscribe(handler);
    const unsub2 = bus.subscribe(handler);

    expect(bus.subscriberCount()).toBe(2);

    bus.emit([mockEvent]);
    expect(handler).toHaveBeenCalledTimes(2);

    // Unsubscribing only removes one subscription
    unsub1();
    expect(bus.subscriberCount()).toBe(1);

    bus.emit([mockEvent]);
    // The previous call gave 2, this call gives 1 more
    expect(handler).toHaveBeenCalledTimes(3);

    unsub2();
    expect(bus.subscriberCount()).toBe(0);

    bus.emit([mockEvent]);
    expect(handler).toHaveBeenCalledTimes(3); // Not called again
  });
});
