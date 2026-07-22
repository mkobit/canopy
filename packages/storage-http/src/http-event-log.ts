import type { Result, GraphEvent, EventLogStore, EventLogQueryOptions } from '@canopy/graph';
import { fromAsyncThrowable } from '@canopy/graph';

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

const deserializeEvent = (storable: unknown): GraphEvent => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = storable as any;
  switch (s.type) {
    case 'NodeCreated':
    case 'EdgeCreated': {
      return {
        ...s,
        properties: new Map(Object.entries(s.properties)),
      } as GraphEvent;
    }
    case 'NodePropertiesUpdated':
    case 'EdgePropertiesUpdated': {
      return {
        ...s,
        changes: new Map(Object.entries(s.changes)),
      } as GraphEvent;
    }
    case 'NodeDeleted':
    case 'EdgeDeleted':
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return s as GraphEvent;
    }
    default: {
      // eslint-disable-next-line functional/no-throw-statements
      throw new Error(`Unknown event type: ${s.type}`);
    }
  }
};

export const createHTTPEventLog = (baseUrl: string, options?: HTTPOptions): HTTPEventLog => {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const fetchFn = options?.fetch ?? fetch;
  const customHeaders = options?.headers ?? {};

  return {
    appendEvents: async (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      return fromAsyncThrowable(async () => {
        const url = `${cleanBase}/graphs/${graphId}/events`;
        const response = await fetchFn(url, {
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
      return fromAsyncThrowable(async () => {
        const params = new URLSearchParams();
        if (queryOptions.after) {
          params.set('after', queryOptions.after);
        }
        if (queryOptions.before) {
          params.set('before', queryOptions.before);
        }
        if (queryOptions.limit !== undefined) {
          params.set('limit', String(queryOptions.limit));
        }
        if (queryOptions.reverse !== undefined) {
          params.set('reverse', String(queryOptions.reverse));
        }

        const queryString = params.toString();
        const url = queryString
          ? `${cleanBase}/graphs/${graphId}/events?${queryString}`
          : `${cleanBase}/graphs/${graphId}/events`;

        const response = await fetchFn(url, {
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

        const data = (await response.json()) as unknown;
        const rawEvents =
          data && typeof data === 'object' && 'events' in data && Array.isArray(data.events)
            ? data.events
            : Array.isArray(data)
              ? data
              : [];

        return rawEvents.map(deserializeEvent);
      });
    },
  };
};
