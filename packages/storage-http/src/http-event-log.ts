import type {
  Result,
  GraphEvent,
  EventLogStore,
  EventLogQueryOptions,
  PropertyValue,
} from '@canopy/graph';
import { ok, err, fromAsyncThrowable } from '@canopy/graph';

export interface HTTPOptions {
  readonly headers?: Record<string, string>;
  readonly fetch?: typeof fetch;
}

export type HTTPEventLog = EventLogStore;

const serializeEvent = (event: GraphEvent): unknown => {
  switch (event.type) {
    case 'NodeCreated':
    case 'EdgeCreated': {
      return {
        ...event,
        properties: Object.fromEntries(event.properties),
      };
    }
    case 'NodePropertiesUpdated':
    case 'EdgePropertiesUpdated': {
      return {
        ...event,
        changes: Object.fromEntries(event.changes),
      };
    }
    case 'NodeDeleted':
    case 'EdgeDeleted': {
      return event;
    }
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return event;
    }
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const deserializeEvent = (storable: unknown): Result<GraphEvent, Error> => {
  if (!isObject(storable) || typeof storable.type !== 'string') {
    return err(new Error('Invalid storable event'));
  }

  switch (storable.type) {
    case 'NodeCreated':
    case 'EdgeCreated': {
      const properties = isObject(storable.properties)
        ? new Map(Object.entries(storable.properties as Record<string, PropertyValue>))
        : new Map();
      return ok({
        ...storable,
        properties,
      } as unknown as GraphEvent);
    }
    case 'NodePropertiesUpdated':
    case 'EdgePropertiesUpdated': {
      const changes = isObject(storable.changes)
        ? new Map(Object.entries(storable.changes as Record<string, PropertyValue>))
        : new Map();
      return ok({
        ...storable,
        changes,
      } as unknown as GraphEvent);
    }
    case 'NodeDeleted':
    case 'EdgeDeleted':
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return ok(storable as unknown as GraphEvent);
    }
    default: {
      return err(new Error(`Unknown event type: ${storable.type}`));
    }
  }
};

export const createHTTPEventLog = (baseUrl: string, options?: HTTPOptions): HTTPEventLog => {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const fetchFunction = options?.fetch ?? fetch;
  const customHeaders = options?.headers ?? {};

  return {
    appendEvents: async (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      return fromAsyncThrowable(async () => {
        const url = `${cleanBase}/graphs/${graphId}/events`;
        const response = await fetchFunction(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...customHeaders,
          },
          body: JSON.stringify({
            events: events.map(serializeEvent),
          }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(
            `Failed to append events: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`,
          );
        }

        return;
      });
    },

    getEvents: async (
      graphId: string,
      queryOptions: EventLogQueryOptions = {},
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      const fetchResult = await fromAsyncThrowable(async () => {
        const parameters = new URLSearchParams();
        if (queryOptions.after) {
          parameters.set('after', queryOptions.after);
        }
        if (queryOptions.before) {
          parameters.set('before', queryOptions.before);
        }
        if (queryOptions.limit !== undefined) {
          parameters.set('limit', String(queryOptions.limit));
        }
        if (queryOptions.reverse !== undefined) {
          parameters.set('reverse', String(queryOptions.reverse));
        }

        const queryString = parameters.toString();
        const url = queryString
          ? `${cleanBase}/graphs/${graphId}/events?${queryString}`
          : `${cleanBase}/graphs/${graphId}/events`;

        const response = await fetchFunction(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...customHeaders,
          },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(
            `Failed to get events: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`,
          );
        }

        return response.json() as Promise<unknown>;
      });

      if (!fetchResult.ok) {
        return fetchResult;
      }

      const data = fetchResult.value;
      const rawEvents =
        data && typeof data === 'object' && 'events' in data && Array.isArray(data.events)
          ? data.events
          : Array.isArray(data)
            ? data
            : [];

      const eventResults = rawEvents.map(deserializeEvent);
      const firstError = eventResults.find((r) => !r.ok);
      if (firstError && !firstError.ok) {
        return firstError;
      }

      return ok(eventResults.map((r) => (r as { ok: true; value: GraphEvent }).value));
    },
  };
};
