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
  const listeners = new Set<(message: EventStreamMessage) => void>();
  // eslint-disable-next-line functional/no-let -- encapsulated stream buffer
  let buffer: readonly EventStreamMessage[] = [];
  // eslint-disable-next-line functional/no-let -- encapsulated stream lifecycle state
  let closed = false;

  const notifyListeners = (message: EventStreamMessage): void => {
    // eslint-disable-next-line functional/no-loop-statements -- notify listener set
    for (const listener of listeners) {
      listener(message);
    }
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    unsubscribeSession();
    notifyListeners({ kind: 'end' });
    // eslint-disable-next-line functional/immutable-data -- clear subscriber set on close
    listeners.clear();
    buffer = [];
  };

  const handleGraphEvents = (
    _graph: unknown,
    delta: readonly GraphEvent[] | Readonly<{ applied?: readonly GraphEvent[] }>,
  ): void => {
    if (closed) return;

    const events = Array.isArray(delta)
      ? delta
      : 'applied' in delta && Array.isArray(delta.applied)
        ? delta.applied
        : [];

    // eslint-disable-next-line functional/no-loop-statements -- process applied events
    for (const event of events) {
      if (buffer.length >= bufferCapacity) {
        const overflowMessage: EventStreamMessage = {
          kind: 'overflow_disconnect',
          gapCount: buffer.length + 1,
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
      buffer = [...buffer, message];
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
      // eslint-disable-next-line functional/immutable-data -- add subscriber to active set
      listeners.add(listener);
      return () => {
        // eslint-disable-next-line functional/immutable-data -- remove subscriber from active set
        listeners.delete(listener);
      };
    },
    getBufferCount: () => buffer.length,
    isClosed: () => closed,
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
