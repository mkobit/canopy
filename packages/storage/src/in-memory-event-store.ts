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
      const existingIds = new Set(existingEvents.map((e) => e.eventId));
      const newEvents = [...existingEvents];

      // eslint-disable-next-line functional/no-loop-statements
      for (const event of events) {
        if (!existingIds.has(event.eventId)) {
          newEvents.push(event);

          existingIds.add(event.eventId);
        }
      }

      // Sort the events by eventId ascending
      const sortedEvents = newEvents.toSorted((a, b) => a.eventId.localeCompare(b.eventId));

      graphs.set(graphId, sortedEvents);

      return Promise.resolve(ok(undefined));
    },

    getEvents: (
      graphId: string,
      options?: EventLogQueryOptions,
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      const events = graphs.get(graphId) ?? [];

      let filteredEvents = [...events];

      if (options) {
        const { after, before } = options;
        if (after) {
          filteredEvents = filteredEvents.filter((e) => e.eventId > after);
        }

        if (before) {
          filteredEvents = filteredEvents.filter((e) => e.eventId < before);
        }

        if (options.reverse) {
          filteredEvents.reverse();
        }

        if (options.limit !== undefined && options.limit >= 0) {
          filteredEvents = filteredEvents.slice(0, options.limit);
        }
      }

      return Promise.resolve(ok(filteredEvents));
    },
  };
};
