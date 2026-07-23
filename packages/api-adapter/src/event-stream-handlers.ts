import type { GraphEvent } from '@canopy/graph';
import type { ApiAdapterContext } from './api-context';
import type { EventStreamMessage, EventStreamOptions } from './api-payloads';

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
  let buffer: readonly EventStreamMessage[] = [];
  let closed = false;

  const notifyListeners = (message: EventStreamMessage): void => {
    // eslint-disable-next-line functional/no-loop-statements
    for (const listener of listeners) {
      listener(message);
    }
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    unsubscribeSession();
    notifyListeners({ kind: 'end' });
    listeners.clear();
    buffer = [];
  };

  const handleGraphEvents = (_graph: unknown, delta: { applied?: readonly GraphEvent[] } | readonly GraphEvent[]): void => {
    if (closed) return;

    const events = Array.isArray(delta) ? delta : (delta?.applied ?? []);

    // eslint-disable-next-line functional/no-loop-statements
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
    : () => {};

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getBufferCount: () => buffer.length,
    isClosed: () => closed,
    close,
  };
}
