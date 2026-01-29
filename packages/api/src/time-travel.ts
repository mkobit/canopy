import type { Graph, EventId, Result, Instant } from '@canopy/types';
import type { EventLogStore } from '@canopy/storage';
import { projectGraph, createGraph } from '@canopy/core';
import { fromAsyncThrowable, asGraphId } from '@canopy/types';
import { Temporal } from 'temporal-polyfill';

export type TimeTravelTarget =
  | { readonly timestamp: Instant }
  | { readonly eventId: EventId };

/**
 * Returns the maximum possible UUIDv7 (lexicographically) for a given timestamp (ms precision).
 * Used to query events "up to and including" a timestamp.
 */
export function maxEventIdForTimestamp(timestamp: Instant): EventId {
  const epochMs = Temporal.Instant.from(timestamp).epochMilliseconds;
  const hex = epochMs.toString(16).padStart(12, '0');
  const part1 = hex.slice(0, 8);
  const part2 = hex.slice(8, 12);

  // UUIDv7 structure:
  // 0-8: unix_ts_ms (32)
  // 9-13: unix_ts_ms (16)
  // 14-18: ver (4) + rand_a (12) -> 7fff (max)
  // 19-23: var (2) + rand_b (62) -> variant 10xx (b) + fff...
  // 24-36: rand_b (rest) -> ffffffffffff

  return `${part1}-${part2}-7fff-bfff-ffffffffffff` as EventId;
}

/**
 * Increments a UUIDv7 string lexicographically by 1.
 * Used to transform an inclusive upper bound to an exclusive one.
 */
export function incrementEventId(eventId: EventId): EventId {
  const hexChars = eventId.toLowerCase().split('');

  for (let i = hexChars.length - 1; i >= 0; i--) {
    const char = hexChars[i];
    if (char === '-') continue;

    const val = parseInt(char, 16);
    if (val < 15) {
      hexChars[i] = (val + 1).toString(16);
      return hexChars.join('') as EventId;
    } else {
      hexChars[i] = '0';
    }
  }

  // Overflow (should not happen for valid UUIDs in our lifetime)
  return eventId;
}

/**
 * Reconstructs the graph state at a specific point in time (timestamp or eventId).
 *
 * @param store The EventLogStore containing the history.
 * @param graphId The ID of the graph to reconstruct.
 * @param target The target point in time (timestamp or eventId).
 * @returns The reconstructed Graph.
 */
export async function getGraphAt(
  store: EventLogStore,
  graphId: string,
  target: TimeTravelTarget
): Promise<Result<Graph, Error>> {
  return fromAsyncThrowable(async () => {
    let beforeEventId: EventId;

    if ('eventId' in target) {
      // We want state *after* target.eventId.
      // Store supports 'before' (exclusive).
      // So we need 'before: target.eventId + 1'.
      beforeEventId = incrementEventId(target.eventId);
    } else {
      // We want state at timestamp.
      // Effectively all events with timestamp <= target.timestamp.
      // So we use max possible UUID for that timestamp, which is >= any real event in that ms.
      // But query is exclusive 'before'.
      // So we need 'before: (max UUID for timestamp) + 1'?
      // Or simply 'before: (max UUID for timestamp)' implies we exclude the theoretical max UUID?
      // Since real events are random, they are strictly less than max UUID.
      // So 'before: maxUUID' will include all real events in that ms.
      beforeEventId = maxEventIdForTimestamp(target.timestamp);
    }

    // We fetch ALL events up to that point.
    const eventsResult = await store.getEvents(graphId, {
      before: beforeEventId,
    });

    if (!eventsResult.ok) {
      throw eventsResult.error;
    }

    const events = eventsResult.value;

    const initialGraphResult = createGraph(asGraphId(graphId), 'Reconstructed Graph');

    if (!initialGraphResult.ok) {
       throw initialGraphResult.error;
    }

    const initialGraph = initialGraphResult.value;

    const projectResult = projectGraph(events, initialGraph);

    if (!projectResult.ok) {
      throw projectResult.error;
    }

    return projectResult.value;
  });
}
