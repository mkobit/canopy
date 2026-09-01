/* eslint-disable functional/no-return-void */
import type { EventBus } from '@canopy/graph';
import type { ApiAdapterContext } from '../../api-context';
import type { EventStreamMessage } from '../../api-payloads';
import { createEventStreamSubscriber } from '../../event-stream-handlers';

// eslint-disable-next-line unicorn/name-replacements -- renaming would also require updating the import alias in graphql-adapter.ts, outside this batch
export type EventStreamSubscriptionArgs = Readonly<{
  lastSeenEventId?: string;
  bufferCapacity?: number;
}>;

export type EventStreamSubscriptionValue = Readonly<{
  eventStream: EventStreamMessage;
}>;

export const createSubscriptionResolvers = (context: ApiAdapterContext, _eventBus?: EventBus) => ({
  eventStream: {
    subscribe: (_parent: unknown, arguments_: EventStreamSubscriptionArgs) => {
      const subscriber = createEventStreamSubscriber(context, {
        bufferCapacity: arguments_.bufferCapacity ?? context.limits?.maxStreamBuffer ?? 100,
      });

      type SubscriptionResolver = (
        result: Readonly<IteratorResult<EventStreamSubscriptionValue>>,
      ) => void;
      const messageQueue = { current: [] as readonly EventStreamMessage[] };
      const pendingResolve = {
        current: null as SubscriptionResolver | null,
      };
      const isDone = { current: false };

      const unsubscribe = subscriber.subscribe((message: EventStreamMessage) => {
        if (isDone.current) return;

        const result: Readonly<IteratorResult<EventStreamSubscriptionValue>> = {
          value: { eventStream: message },
          done: false,
        };

        if (pendingResolve.current) {
          const resolve = pendingResolve.current;
          pendingResolve.current = null;
          resolve(result);
        } else {
          messageQueue.current = [...messageQueue.current, message];
        }
      });

      return {
        [Symbol.asyncIterator]: () => {
          return {
            async next(): Promise<Readonly<IteratorResult<EventStreamSubscriptionValue>>> {
              const head = messageQueue.current[0];
              if (head !== undefined) {
                messageQueue.current = messageQueue.current.slice(1);
                return {
                  value: { eventStream: head },
                  done: false,
                };
              }

              if (isDone.current || subscriber.isClosed()) {
                return { value: undefined, done: true };
              }

              const { promise, resolve } =
                Promise.withResolvers<Readonly<IteratorResult<EventStreamSubscriptionValue>>>();
              pendingResolve.current = resolve;
              return promise;
            },

            async return(): Promise<Readonly<IteratorResult<EventStreamSubscriptionValue>>> {
              isDone.current = true;
              unsubscribe();
              subscriber.close();
              if (pendingResolve.current) {
                const resolve = pendingResolve.current;
                pendingResolve.current = null;
                resolve({ value: undefined, done: true });
              }
              return { value: undefined, done: true };
            },
          };
        },
      };
    },
  },
});
