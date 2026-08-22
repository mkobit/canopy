import type { GraphEvent, Result } from '@canopy/graph';
import { ok } from '@canopy/graph';
import type { EventLogStore, EventLogQueryOptions } from './types';

export const createInMemoryEventStore = (): EventLogStore => {
  // Internal mutable state - keyed by graphId, each value is an array of events
  // Events within each array are ordered by eventId (UUIDv7 = time-ordered)
  const graphs = new Map<string, GraphEvent[]>();

  return {
    appendEvents: (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      const existingEvents = graphs.get(graphId) ?? [];
      const existingIds = new Set(existingEvents.map((event_) => event_.eventId));

      const seenIds = new Set<string>();
      const uniqueNewEvents = events.filter((event_) => {
        if (existingIds.has(event_.eventId) || seenIds.has(event_.eventId)) {
          return false;
        }
        seenIds.add(event_.eventId);
        return true;
      });

      const combined = [...existingEvents, ...uniqueNewEvents];

      // Sort the events by eventId ascending
      const sortedEvents = combined.toSorted((a, b) => a.eventId.localeCompare(b.eventId));

      graphs.set(graphId, sortedEvents);

      return Promise.resolve(ok(undefined));
    },

    getEvents: (
      graphId: string,
      options?: EventLogQueryOptions,
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      const events = graphs.get(graphId) ?? [];

      if (!options) {
        return Promise.resolve(ok(events));
      }

      const { after, before, reverse, limit } = options;
      const afterFiltered = after ? events.filter((event_) => event_.eventId > after) : events;
      const beforeFiltered = before
        ? afterFiltered.filter((event_) => event_.eventId < before)
        : afterFiltered;
      const reverseOrdered = reverse ? beforeFiltered.toReversed() : beforeFiltered;
      const limited =
        limit !== undefined && limit >= 0 ? reverseOrdered.slice(0, limit) : reverseOrdered;

      return Promise.resolve(ok(limited));
    },
  };
};
