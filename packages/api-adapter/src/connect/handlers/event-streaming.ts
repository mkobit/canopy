/* eslint-disable functional/no-return-void */
import type { EventBus } from '@canopy/graph';
import { createInstant } from '@canopy/graph';
import type { ApiAdapterContext } from '../../api-context';
import type { EventStreamMessage } from '../../api-payloads';
import { createEventStreamSubscriber, executeReplayEventStream } from '../../event-stream-handlers';

export type ConnectEventStreamItem = Readonly<{
  event_id: string;
  event_type: string;
  payload_json: string;
  sequence_number: number;
  timestamp: string;
}>;

export type ConnectEventStreamOptions = Readonly<{
  eventBus?: EventBus;
  bufferCapacity?: number;
  maxReplayCount?: number;
}>;

export type EventStreamRequestPayload = Readonly<{
  last_seen_event_id?: string;
  graph_id?: string;
  tenant_id?: string;
  max_replay_count?: number;
}>;

const serializeEventPayload = (event: Readonly<Record<string, unknown>>): string => {
  const properties =
    'properties' in event && event.properties instanceof Map
      ? Object.fromEntries(event.properties)
      : event.properties;
  const changes =
    'changes' in event && event.changes instanceof Map
      ? Object.fromEntries(event.changes)
      : event.changes;

  return JSON.stringify({
    ...event,
    ...('properties' in event && { properties }),
    ...('changes' in event && { changes }),
  });
};

const formatMessageToConnectItem = (msg: EventStreamMessage): ConnectEventStreamItem => {
  if (msg.kind === 'event' && msg.event) {
    const sequenceNumber =
      'sequenceNumber' in msg.event && typeof msg.event.sequenceNumber === 'number'
        ? msg.event.sequenceNumber
        : 0;

    return {
      event_id: msg.event.eventId,
      event_type: msg.event.type,
      payload_json: serializeEventPayload(msg.event as unknown as Record<string, unknown>),
      sequence_number: sequenceNumber,
      timestamp: msg.event.timestamp,
    };
  }

  if (msg.kind === 'gap') {
    return {
      event_id: typeof msg.lastSeenEventId === 'string' ? msg.lastSeenEventId : 'gap',
      event_type: 'GAP_NOTIFIED',
      payload_json: JSON.stringify({
        gapCount: msg.gapCount ?? 0,
        reason: msg.reason ?? '',
      }),
      sequence_number: 0,
      timestamp: createInstant(),
    };
  }

  if (msg.kind === 'overflow_disconnect') {
    return {
      event_id: 'overflow',
      event_type: 'OVERFLOW_DISCONNECT',
      payload_json: JSON.stringify({
        gapCount: msg.gapCount ?? 0,
        reason: msg.reason ?? '',
      }),
      sequence_number: 0,
      timestamp: createInstant(),
    };
  }

  return {
    event_id: 'end',
    event_type: 'STREAM_END',
    payload_json: '{}',
    sequence_number: 0,
    timestamp: createInstant(),
  };
};

const createSubscribeGenerator = async function* (
  context: ApiAdapterContext,
  options?: ConnectEventStreamOptions,
): AsyncGenerator<ConnectEventStreamItem, void, unknown> {
  const subscriber = createEventStreamSubscriber(context, {
    bufferCapacity: options?.bufferCapacity ?? context.limits?.maxStreamBuffer ?? 100,
  });

  // eslint-disable-next-line functional/no-let -- queue state
  let queue: readonly ConnectEventStreamItem[] = [];
  // eslint-disable-next-line functional/no-let -- resolver callback
  let resolveNext: ((item: ConnectEventStreamItem | null) => void) | null = null;
  // eslint-disable-next-line functional/no-let -- stream closed state
  let closed = false;

  const unsubscribe = subscriber.subscribe((msg: EventStreamMessage) => {
    if (closed) return;

    if (msg.kind === 'end') {
      closed = true;
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve(null);
      }
      return;
    }

    const item = formatMessageToConnectItem(msg);

    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve(item);
    } else {
      queue = [...queue, item];
    }

    if (msg.kind === 'overflow_disconnect') {
      closed = true;
    }
  });

  // eslint-disable-next-line functional/no-try-statements -- stream cleanup on completion
  try {
    // eslint-disable-next-line functional/no-loop-statements -- async generator stream consumption
    while (!closed || queue.length > 0) {
      if (queue.length > 0) {
        const head = queue[0];
        queue = queue.slice(1);
        if (head !== undefined) {
          yield head;
        }
      } else {
        const nextItem = await new Promise<ConnectEventStreamItem | null>((resolve) => {
          resolveNext = resolve;
        });
        if (nextItem === null) {
          break;
        }
        yield nextItem;
      }
    }
  } finally {
    closed = true;
    unsubscribe();
    subscriber.close();
  }
};

const createReplayGenerator = async function* (
  context: ApiAdapterContext,
  req: EventStreamRequestPayload,
  options?: ConnectEventStreamOptions,
): AsyncGenerator<ConnectEventStreamItem, void, unknown> {
  const graphId = req.graph_id ?? context.graph.id;
  const tenantId = req.tenant_id ?? context.authContext?.tenantId ?? '';
  const lastSeenEventId = req.last_seen_event_id ?? '';
  const maxReplayCount = req.max_replay_count ?? options?.maxReplayCount;

  const replayRes = await executeReplayEventStream(context, {
    tenantId,
    graphId,
    lastSeenEventId,
    ...(maxReplayCount !== undefined && { maxReplayCount }),
  });

  if (!replayRes.ok) {
    const errorItem: ConnectEventStreamItem = {
      event_id: 'error',
      event_type: 'REPLAY_ERROR',
      payload_json: JSON.stringify({
        code: replayRes.error.code,
        message: replayRes.error.message,
      }),
      sequence_number: 0,
      timestamp: createInstant(),
    };
    yield errorItem;
    return;
  }

  // eslint-disable-next-line functional/no-loop-statements -- yield replayed items
  for (const message of replayRes.value) {
    yield formatMessageToConnectItem(message);
  }
};

export const createConnectEventStreamHandlers = (
  context: ApiAdapterContext,
  options?: ConnectEventStreamOptions,
) => ({
  subscribeEventStream: (_req: EventStreamRequestPayload) =>
    createSubscribeGenerator(context, options),
  replayEventStream: (req: EventStreamRequestPayload) =>
    createReplayGenerator(context, req, options),
});
