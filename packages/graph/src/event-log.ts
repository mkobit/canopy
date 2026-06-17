import type { EventId } from './identifiers';
import type { GraphEvent } from './events';
import type { Result } from './result';

export interface EventLogQueryOptions {
  readonly after?: EventId;
  readonly before?: EventId;
  readonly limit?: number;
  readonly reverse?: boolean;
}

export interface EventLogStore {
  readonly appendEvents: (
    graphId: string,
    events: readonly GraphEvent[],
  ) => Promise<Result<void, Error>>;
  readonly getEvents: (
    graphId: string,
    options?: EventLogQueryOptions,
  ) => Promise<Result<readonly GraphEvent[], Error>>;
}
