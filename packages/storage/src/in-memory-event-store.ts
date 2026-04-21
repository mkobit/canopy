import type { GraphEvent, Result } from '@canopy/types';
import { ok } from '@canopy/types';
import type { EventLogStore, EventLogQueryOptions } from './types';

export const createInMemoryEventStore = (): EventLogStore => {
  // Internal mutable state - keyed by graphId, each value is an array of events
  // Events within each array are ordered by eventId (UUIDv7 = time-ordered)
  const graphs: Map<string, GraphEvent[]> = new Map();

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
      const sortedEvents = newEvents.toSorted((a, b) =>
        a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0,
      );

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
        if (options.after) {
          filteredEvents = filteredEvents.filter((e) => e.eventId > options.after!);
        }

        if (options.before) {
          filteredEvents = filteredEvents.filter((e) => e.eventId < options.before!);
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
