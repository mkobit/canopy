import type { GraphEvent, NodeCreated } from './events';
import type { TypeId } from './identifiers';

// eslint-disable-next-line functional/no-return-void
export type EventHandler = (events: readonly GraphEvent[]) => void;

function dispatchNodeCreated(
  events: readonly GraphEvent[],
  typeId: TypeId,
  // eslint-disable-next-line functional/no-return-void
  callback: (event: NodeCreated) => void,
  index = 0,
  // eslint-disable-next-line functional/no-return-void
): void {
  if (index >= events.length) {
    return;
  }
  const event = events[index];
  if (event !== undefined && event.type === 'NodeCreated' && event.nodeType === typeId) {
    callback(event);
  }
  dispatchNodeCreated(events, typeId, callback, index + 1);
}

export const onNodeCreated = (
  typeId: TypeId,
  // eslint-disable-next-line functional/no-return-void
  callback: (event: NodeCreated) => void,
): EventHandler => {
  // eslint-disable-next-line functional/no-return-void
  return (events: readonly GraphEvent[]) => {
    dispatchNodeCreated(events, typeId, callback);
  };
};

export interface EventBus {
  // eslint-disable-next-line functional/no-return-void
  readonly subscribe: (handler: EventHandler) => () => void;
  // eslint-disable-next-line functional/no-return-void
  readonly emit: (events: readonly GraphEvent[]) => void;
  readonly subscriberCount: () => number;
}

function dispatchSubscribers(
  subscribers: readonly EventHandler[],
  events: readonly GraphEvent[],
  index = 0,
  // eslint-disable-next-line functional/no-return-void
): void {
  if (index >= subscribers.length) {
    return;
  }
  const subscriber = subscribers[index];
  if (subscriber !== undefined) {
    subscriber(events);
  }
  dispatchSubscribers(subscribers, events, index + 1);
}

export function createEventBus(): EventBus {
  const subscribersCell = { current: new Set<EventHandler>() as ReadonlySet<EventHandler> };

  // eslint-disable-next-line functional/no-return-void
  const subscribe = (handler: EventHandler): (() => void) => {
    // Wrap the handler to ensure independent subscriptions even for the same reference
    // eslint-disable-next-line functional/no-return-void, functional/prefer-tacit
    const wrappedHandler: EventHandler = (events: readonly GraphEvent[]) => handler(events);

    // Create a new Set to maintain immutability of the reference
    subscribersCell.current = new Set([...subscribersCell.current, wrappedHandler]);

    // eslint-disable-next-line functional/no-return-void
    return () => {
      // Return a function that removes the handler by creating a new Set
      subscribersCell.current = new Set(
        [...subscribersCell.current].filter((handler_) => handler_ !== wrappedHandler),
      );
    };
  };

  // eslint-disable-next-line functional/no-return-void
  const emit = (events: readonly GraphEvent[]): void => {
    dispatchSubscribers([...subscribersCell.current], events);
  };

  const subscriberCount = (): number => subscribersCell.current.size;

  return {
    subscribe,
    emit,
    subscriberCount,
  };
}
