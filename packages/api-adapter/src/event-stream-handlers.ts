/* eslint-disable functional/no-return-void */
import { asEventId, err, ok } from '@canopy/graph';
import type { GraphEvent } from '@canopy/graph';
import type { ApiAdapterContext } from './api-context';
import type {
  ApiResponse,
  EventStreamMessage,
  EventStreamOptions,
  ReplayRequestPayload,
} from './api-payloads';
import { createApiAdapterError } from './result-errors';

export interface EventStreamSubscription {
  readonly subscribe: (listener: (message: EventStreamMessage) => void) => () => void;
  readonly getBufferCount: () => number;
  readonly isClosed: () => boolean;
  readonly close: () => void;
}

export function createEventStreamSubscriber(
  context: ApiAdapterContext,
  options: EventStreamOptions = {},
): EventStreamSubscription {
  const bufferCapacity = options.bufferCapacity ?? 100;
  const listeners = { current: new Set<(message: EventStreamMessage) => void>() };
  const buffer = { current: [] as readonly EventStreamMessage[] };
  const closed = { current: false };

  const notifyListeners = (message: EventStreamMessage): void => {
    // eslint-disable-next-line functional/no-loop-statements -- notify listener set
    for (const listener of listeners.current) {
      listener(message);
    }
  };

  const close = (): void => {
    if (closed.current) return;
    closed.current = true;
    unsubscribeSession();
    notifyListeners({ kind: 'end' });
    listeners.current = new Set();
    buffer.current = [];
  };

  const handleGraphEvents = (
    _graph: unknown,
    delta: readonly GraphEvent[] | Readonly<{ applied?: readonly GraphEvent[] }>,
  ): void => {
    if (closed.current) return;

    const events = Array.isArray(delta)
      ? delta
      : 'applied' in delta && Array.isArray(delta.applied)
        ? delta.applied
        : [];

    // eslint-disable-next-line functional/no-loop-statements -- process applied events
    for (const event of events) {
      if (buffer.current.length >= bufferCapacity) {
        const overflowMessage: EventStreamMessage = {
          kind: 'overflow_disconnect',
          gapCount: buffer.current.length + 1,
          reason: `Subscriber buffer capacity of ${bufferCapacity} exceeded`,
        };
        notifyListeners(overflowMessage);
        close();
        return;
      }

      const message: EventStreamMessage = {
        kind: 'event',
        event,
      };
      buffer.current = [...buffer.current, message];
      notifyListeners(message);
    }
  };

  const unsubscribeSession = context.session
    ? context.session.subscribe(handleGraphEvents)
    : (): void => {
        // no-op fallback when session is not provided
      };

  return {
    subscribe: (listener) => {
      listeners.current = new Set([...listeners.current, listener]);
      return () => {
        listeners.current = new Set([...listeners.current].filter((l) => l !== listener));
      };
    },
    getBufferCount: () => buffer.current.length,
    isClosed: () => closed.current,
    close,
  };
}

export async function executeReplayEventStream(
  context: ApiAdapterContext,
  payload: ReplayRequestPayload,
): Promise<ApiResponse<readonly EventStreamMessage[]>> {
  const tenantId = context.authContext?.tenantId;
  if (tenantId !== undefined && tenantId !== payload.tenantId) {
    return err(
      createApiAdapterError(
        'FORBIDDEN',
        `Tenant boundary mismatch: payload tenant '${payload.tenantId}' does not match context tenant '${tenantId}'`,
      ),
    );
  }

  if (!context.eventLogStore) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'EventLogStore is required in ApiAdapterContext for event catch-up replay',
      ),
    );
  }

  const maxReplay = payload.maxReplayCount ?? 1000;
  const eventsResult = await context.eventLogStore.getEvents(payload.graphId, {
    after: asEventId(payload.lastSeenEventId),
  });

  if (!eventsResult.ok) {
    return err(
      createApiAdapterError(
        'INTERNAL_ERROR',
        `Failed to query event log store for catch-up replay: ${eventsResult.error.message}`,
      ),
    );
  }

  const unacknowledgedEvents = eventsResult.value;

  if (unacknowledgedEvents.length > maxReplay) {
    const gapMessage: EventStreamMessage = {
      kind: 'gap',
      gapCount: unacknowledgedEvents.length,
      lastSeenEventId: payload.lastSeenEventId,
      reason: `Unacknowledged event count (${unacknowledgedEvents.length}) exceeds maximum replay threshold of ${maxReplay}. Full graph snapshot required.`,
    };
    return ok([gapMessage]);
  }

  const streamMessages: readonly EventStreamMessage[] = unacknowledgedEvents.map((event) => ({
    kind: 'event',
    event,
  }));

  return ok(streamMessages);
}
