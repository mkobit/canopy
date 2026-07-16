import { describe, it, expect } from 'bun:test';
import { createGraphSession } from './graph-session';
import { createDraftSession } from './draft-session';
import { Temporal } from 'temporal-polyfill';

import {
  createGraphId,
  createNodeId,
  asTypeId,
  createEventId,
  asDeviceId,
  createInstant,
  asInstant,
  unwrap,
  ok,
  type GraphEvent,
  type NodeCreated,
} from '@canopy/graph';
import type { EventLogStore, EventLogQueryOptions } from './event-log';

function createTestEventLog(): EventLogStore {
  const events: GraphEvent[] = [];
  return {
    appendEvents: (_graphId, newEvents) => {
      const seen = new Set(events.map((e) => e.eventId));
      for (const event of newEvents) {
        if (!seen.has(event.eventId)) {
          events.push(event);
          seen.add(event.eventId);
        }
      }
      events.sort((a, b) => a.eventId.localeCompare(b.eventId));
      return Promise.resolve(ok(undefined));
    },
    getEvents: (_graphId, options?: EventLogQueryOptions) => {
      let result = [...events];
      const after = options?.after;
      if (after !== undefined) {
        result = result.filter((e) => e.eventId > after);
      }
      const before = options?.before;
      if (before !== undefined) {
        result = result.filter((e) => e.eventId < before);
      }
      if (options?.reverse) {
        result.reverse();
      }
      if (options?.limit !== undefined) {
        result = result.slice(0, options.limit);
      }
      return Promise.resolve(ok(result));
    },
  };
}

const sessionDeviceId = asDeviceId('00000000-0000-0000-0000-0000000000aa');
const otherDeviceId = asDeviceId('00000000-0000-0000-0000-0000000000bb');

function nodeCreatedEvent(overrides: Partial<NodeCreated> = {}): NodeCreated {
  return {
    type: 'NodeCreated',
    eventId: createEventId(),
    id: createNodeId(),
    nodeType: asTypeId('test-type'),
    properties: new Map([['name', 'a']]),
    timestamp: createInstant(),
    deviceId: otherDeviceId,
    ...overrides,
  };
}

describe('DraftSession', () => {
  it('creates draft session and verifies combined projection stages events', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const parentSession = createGraphSession(eventLog, graphId, sessionDeviceId);
    await parentSession.load();

    const draftSession = createDraftSession(parentSession);

    expect(draftSession.graph().nodes.size).toBe(parentSession.graph().nodes.size);

    const event = nodeCreatedEvent();
    const applyResult = draftSession.applyEvents([event]);
    expect(applyResult.ok).toBe(true);

    expect(draftSession.graph().nodes.has(event.id)).toBe(true);
    expect(parentSession.graph().nodes.has(event.id)).toBe(false);

    const getNodeResult = draftSession.getNode(event.id);
    expect(getNodeResult.ok).toBe(true);
    if (getNodeResult.ok) {
      expect(getNodeResult.value.id).toBe(event.id);
    }

    const queryResult = draftSession.queryNodes('test-type');
    expect(queryResult.ok).toBe(true);
    if (queryResult.ok) {
      expect(queryResult.value.some((n) => n.id === event.id)).toBe(true);
    }
  });

  it('commit succeeds if revision matches and appends to parent session', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const parentSession = createGraphSession(eventLog, graphId, sessionDeviceId);
    await parentSession.load();

    const draftSession = createDraftSession(parentSession);
    const event = nodeCreatedEvent();
    draftSession.applyEvents([event]);

    const revisionResult = draftSession.getParentRevision();
    expect(revisionResult.ok).toBe(true);
    const expectedRevision = unwrap(revisionResult);

    const commitResult = await draftSession.commit(expectedRevision);
    expect(commitResult.ok).toBe(true);

    expect(parentSession.graph().nodes.has(event.id)).toBe(true);
    expect(draftSession.graph().nodes.size).toBe(parentSession.graph().nodes.size);
  });

  it('commit fails if revision has changed concurrently', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const parentSession = createGraphSession(eventLog, graphId, sessionDeviceId);
    await parentSession.load();

    const draftSession = createDraftSession(parentSession);
    const event = nodeCreatedEvent();
    draftSession.applyEvents([event]);

    const expectedRevision = unwrap(draftSession.getParentRevision());
    const laterInstant = asInstant(
      Temporal.Instant.from(expectedRevision).add({ milliseconds: 10 }).toString(),
    );

    const concurrentEvent = nodeCreatedEvent({ timestamp: laterInstant });
    await parentSession.commit([concurrentEvent]);

    const commitResult = await draftSession.commit(expectedRevision);
    expect(commitResult.ok).toBe(false);
    if (!commitResult.ok) {
      expect(commitResult.error.type).toBe('concurrent-modification');
    }

    expect(draftSession.graph().nodes.has(event.id)).toBe(true);
  });

  it('discard deletes staged events and keeps parent unchanged', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const parentSession = createGraphSession(eventLog, graphId, sessionDeviceId);
    await parentSession.load();

    const draftSession = createDraftSession(parentSession);
    const event = nodeCreatedEvent();
    draftSession.applyEvents([event]);

    const discardResult = draftSession.discard();
    expect(discardResult.ok).toBe(true);

    expect(draftSession.graph().nodes.has(event.id)).toBe(false);
    expect(parentSession.graph().nodes.has(event.id)).toBe(false);
  });

  it('getNode returns error if node not found', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const parentSession = createGraphSession(eventLog, graphId, sessionDeviceId);
    await parentSession.load();

    const draftSession = createDraftSession(parentSession);
    const getNodeResult = draftSession.getNode(createNodeId());
    expect(getNodeResult.ok).toBe(false);
    if (!getNodeResult.ok) {
      expect(getNodeResult.error.type).toBe('node-not-found');
    }
  });
});
