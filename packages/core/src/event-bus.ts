import type { GraphEvent } from '@canopy/types';

// eslint-disable-next-line functional/no-return-void
export type EventHandler = (events: readonly GraphEvent[]) => void;

export interface EventBus {
  // eslint-disable-next-line functional/no-return-void
  readonly subscribe: (handler: EventHandler) => () => void;
  // eslint-disable-next-line functional/no-return-void
  readonly emit: (events: readonly GraphEvent[]) => void;
  readonly subscriberCount: () => number;
}

export function createEventBus(): EventBus {
  // eslint-disable-next-line functional/no-let
  let subscribers: ReadonlySet<EventHandler> = new Set();

  // eslint-disable-next-line functional/no-return-void
  const subscribe = (handler: EventHandler): (() => void) => {
    // Wrap the handler to ensure independent subscriptions even for the same reference
    // eslint-disable-next-line functional/no-return-void, functional/prefer-tacit
    const wrappedHandler: EventHandler = (events: readonly GraphEvent[]) => handler(events);

    // Create a new Set to maintain immutability of the reference
    const newSubscribers = new Set(subscribers);
    // eslint-disable-next-line functional/immutable-data
    newSubscribers.add(wrappedHandler);
    subscribers = newSubscribers;

    // eslint-disable-next-line functional/no-return-void
    return () => {
      // Return a function that removes the handler by creating a new Set
      const updatedSubscribers = new Set(subscribers);
      // eslint-disable-next-line functional/immutable-data
      updatedSubscribers.delete(wrappedHandler);
      subscribers = updatedSubscribers;
    };
  };

  // eslint-disable-next-line functional/no-return-void
  const emit = (events: readonly GraphEvent[]): void => {
    // eslint-disable-next-line functional/no-loop-statements
    for (const handler of subscribers) {
      handler(events);
    }
  };

  const subscriberCount = (): number => subscribers.size;

  return {
    subscribe,
    emit,
    subscriberCount,
  };
}
