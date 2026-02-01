import { describe, it, expect, beforeEach } from 'bun:test';
import * as Y from 'yjs';
import { GraphStore } from './graph-store';
import {
  createEventId,
  createInstant,
  asNodeId,
  asTypeId,
  GraphEvent,
  unwrap,
} from '@canopy/types';

describe('GraphStore Event Log', () => {
  let document: Y.Doc;
  let store: GraphStore;

  beforeEach(() => {
    document = new Y.Doc();
    store = new GraphStore(document);
  });

  it('should add and retrieve an event', () => {
    const event: GraphEvent = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: asNodeId('n1'),
      nodeType: asTypeId('person'),
      properties: new Map([['name', 'Alice']]),
      timestamp: createInstant(),
    };

    unwrap(store.addEvent(event));

    const events = [...store.getEvents()];
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  it('should be idempotent (deduplicate events)', () => {
    const event: GraphEvent = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: asNodeId('n1'),
      nodeType: asTypeId('person'),
      properties: new Map(),
      timestamp: createInstant(),
    };

    unwrap(store.addEvent(event));
    unwrap(store.addEvent(event)); // Add same event again

    const events = [...store.getEvents()];
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  it('should return events in time order (based on eventId)', () => {
    const event1: GraphEvent = {
      type: 'NodeDeleted',
      eventId: createEventId(),
      id: asNodeId('n1'),
      timestamp: createInstant(),
    };

    // Ensure event2 has a later ID.
    // Since createEventId uses UUIDv7 based on current time,
    // and we are in the same tick, we might get collisions or very close values.
    // However, the test runner usually takes enough time.
    // To be safe, we can mock or loop.

    let event2Id = createEventId();
    while (event2Id <= event1.eventId) {
      event2Id = createEventId();
    }

    const event2: GraphEvent = {
      type: 'NodeDeleted',
      eventId: event2Id,
      id: asNodeId('n2'),
      timestamp: createInstant(),
    };

    // Add in reverse order
    unwrap(store.addEvent(event2));
    unwrap(store.addEvent(event1));

    const events = [...store.getEvents()];
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(event1);
    expect(events[1]).toEqual(event2);
  });

  it('should handle different event types', () => {
    const event: GraphEvent = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id: asNodeId('n1'),
      changes: new Map([['age', 30]]),
      timestamp: createInstant(),
    };

    unwrap(store.addEvent(event));
    const retrieved = [...store.getEvents()][0];

    expect(retrieved).toBeDefined();

    if (retrieved && retrieved.type === 'NodePropertiesUpdated') {
      expect(retrieved.changes.get('age')).toBe(30);
    } else {
      throw new Error('Wrong event type');
    }
  });
});
