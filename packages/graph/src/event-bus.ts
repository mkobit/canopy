import type { GraphEvent, NodeCreated } from './events';
import type { TypeId } from './identifiers';

export type EventHandler = (events: readonly GraphEvent[]) => unknown;

interface EventSubscription {
  readonly handler: EventHandler;
}

export const onNodeCreated = (
  typeId: TypeId,
  callback: (event: NodeCreated) => unknown,
): EventHandler => {
  return (events: readonly GraphEvent[]) =>
    events
      .filter(
        (event): event is NodeCreated =>
          event.type === 'NodeCreated' && event.nodeType === typeId,
      )
      .map((event) => callback(event));
};

export interface EventBus {
  readonly subscribe: (handler: EventHandler) => () => boolean;
  readonly emit: (events: readonly GraphEvent[]) => readonly unknown[];
  readonly subscriberCount: () => number;
}

export function createEventBus(): EventBus {
  const subscribersCell = {
    current: new Set<EventSubscription>() as ReadonlySet<EventSubscription>,
  };

  const subscribe = (handler: EventHandler): (() => boolean) => {
    const subscription: EventSubscription = { handler };

    subscribersCell.current = new Set([...subscribersCell.current, subscription]);

    return () => {
      const previousSize = subscribersCell.current.size;
      subscribersCell.current = new Set(
        [...subscribersCell.current].filter((current) => current !== subscription),
      );
      return subscribersCell.current.size < previousSize;
    };
  };

  const emit = (events: readonly GraphEvent[]): readonly unknown[] =>
    [...subscribersCell.current].map((subscriber) => subscriber.handler(events));

  const subscriberCount = (): number => subscribersCell.current.size;

  return {
    subscribe,
    emit,
    subscriberCount,
  };
}
