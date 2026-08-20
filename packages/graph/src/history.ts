import type { Graph } from './graph';
import type { EventId } from './identifiers';
import type { Result } from './result';
import type { Instant } from './temporal';
import type { EventLogStore } from './event-log';
import { projectGraph } from './projection';
import { createGraph } from './create-graph';
import { asGraphId } from './factories';
import { fromAsyncThrowable } from './result';
import { Temporal } from 'temporal-polyfill';

export type TimeTravelTarget = Readonly<{ timestamp: Instant }> | Readonly<{ eventId: EventId }>;

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
  const chars = eventId.toLowerCase().split('');
  const incrementIndex = chars.findLastIndex((char) => char !== '-' && char !== 'f');

  if (incrementIndex === -1) {
    // Overflow (should not happen for valid UUIDs in our lifetime)
    return eventId;
  }

  const incrementedChars = chars.map((char, index) => {
    if (char === '-') return '-';
    if (index < incrementIndex) return char;
    if (index === incrementIndex) {
      return (Number.parseInt(char, 16) + 1).toString(16);
    }
    return '0';
  });

  return incrementedChars.join('') as EventId;
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
  target: TimeTravelTarget,
): Promise<Result<Graph, Error>> {
  return fromAsyncThrowable(async () => {
    const beforeEventId =
      'eventId' in target
        ? incrementEventId(target.eventId)
        : maxEventIdForTimestamp(target.timestamp);

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
