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

      // eslint-disable-next-line functional/no-let -- async iterator queue
      let messageQueue: readonly EventStreamMessage[] = [];
      // eslint-disable-next-line functional/no-let -- async iterator resolver callback
      let pendingResolve:
        ((result: Readonly<IteratorResult<EventStreamSubscriptionValue>>) => void) | null = null;
      // eslint-disable-next-line functional/no-let -- async iterator termination flag
      let isDone = false;

      const unsubscribe = subscriber.subscribe((message: EventStreamMessage) => {
        if (isDone) return;

        const result: Readonly<IteratorResult<EventStreamSubscriptionValue>> = {
          value: { eventStream: message },
          done: false,
        };

        if (pendingResolve) {
          const resolve = pendingResolve;
          pendingResolve = null;
          resolve(result);
        } else {
          messageQueue = [...messageQueue, message];
        }
      });

      return {
        [Symbol.asyncIterator]: () => {
          return {
            async next(): Promise<Readonly<IteratorResult<EventStreamSubscriptionValue>>> {
              const head = messageQueue[0];
              if (head !== undefined) {
                messageQueue = messageQueue.slice(1);
                return {
                  value: { eventStream: head },
                  done: false,
                };
              }

              if (isDone || subscriber.isClosed()) {
                return { value: undefined, done: true };
              }

              const { promise, resolve } =
                Promise.withResolvers<Readonly<IteratorResult<EventStreamSubscriptionValue>>>();
              pendingResolve = resolve;
              return promise;
            },

            async return(): Promise<Readonly<IteratorResult<EventStreamSubscriptionValue>>> {
              isDone = true;
              unsubscribe();
              subscriber.close();
              if (pendingResolve) {
                const resolve = pendingResolve;
                pendingResolve = null;
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
