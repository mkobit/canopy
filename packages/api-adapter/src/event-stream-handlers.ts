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

export type EventStreamListener = (message: EventStreamMessage) => unknown;

interface EventStreamListenerSubscription {
  readonly listener: EventStreamListener;
}

export interface EventStreamSubscription {
  readonly subscribe: (listener: EventStreamListener) => () => boolean;
  readonly getBufferCount: () => number;
  readonly isClosed: () => boolean;
  readonly close: () => boolean;
}

export function createEventStreamSubscriber(
  context: ApiAdapterContext,
  options: EventStreamOptions = {},
): EventStreamSubscription {
  const bufferCapacity = options.bufferCapacity ?? 100;
  const listeners = {
    current:
      new Set<EventStreamListenerSubscription>() as ReadonlySet<EventStreamListenerSubscription>,
  };
  const buffer = { current: [] as readonly EventStreamMessage[] };
  const closed = { current: false };

  const notifyListeners = (message: EventStreamMessage): readonly unknown[] =>
    [...listeners.current].map((subscription) => subscription.listener(message));

  const close = (): boolean => {
    if (closed.current) return false;
    closed.current = true;
    unsubscribeSession();
    notifyListeners({ kind: 'end' });
    listeners.current = new Set();
    buffer.current = [];
    return true;
  };

  const processEvents = (eventsToProcess: readonly GraphEvent[], index = 0): boolean => {
    if (index >= eventsToProcess.length) return true;
    const event = eventsToProcess[index];
    if (event === undefined) return true;

    if (buffer.current.length >= bufferCapacity) {
      const overflowMessage: EventStreamMessage = {
        kind: 'overflow_disconnect',
        gapCount: buffer.current.length + 1,
        reason: `Subscriber buffer capacity of ${bufferCapacity} exceeded`,
      };
      notifyListeners(overflowMessage);
      close();
      return false;
    }

    const message: EventStreamMessage = {
      kind: 'event',
      event,
    };
    buffer.current = [...buffer.current, message];
    notifyListeners(message);
    return processEvents(eventsToProcess, index + 1);
  };

  const handleGraphEvents = (
    _graph: unknown,
    delta: readonly GraphEvent[] | Readonly<{ applied?: readonly GraphEvent[] }>,
  ): boolean => {
    if (closed.current) return false;

    const events = Array.isArray(delta)
      ? delta
      : 'applied' in delta && Array.isArray(delta.applied)
        ? delta.applied
        : [];

    return processEvents(events);
  };

  const unsubscribeSession = context.session
    ? context.session.subscribe(handleGraphEvents)
    : (): boolean => false;

  return {
    subscribe: (listener) => {
      const subscription: EventStreamListenerSubscription = { listener };
      listeners.current = new Set([...listeners.current, subscription]);
      return () => {
        const previousSize = listeners.current.size;
        listeners.current = new Set(
          [...listeners.current].filter((current) => current !== subscription),
        );
        return listeners.current.size < previousSize;
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
