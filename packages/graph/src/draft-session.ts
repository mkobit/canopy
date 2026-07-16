import type { Graph } from './graph';
import type { GraphSession } from './graph-session';
import type { GraphEvent } from './events';
import type { NodeId } from './identifiers';
import type { Node } from './node';
import type { Result } from './result';
import { ok, err } from './result';
import { projectDraftOverlay, applyDraftEvents } from './incremental-projection';

export type DraftError =
  | Readonly<{ type: 'parent-not-found' }>
  | Readonly<{ type: 'unauthorized' }>
  | Readonly<{ type: 'invalid-event-format' }>
  | Readonly<{ type: 'validation-failure'; message: string }>
  | Readonly<{ type: 'concurrent-modification' }>
  | Readonly<{ type: 'storage-error'; message: string }>;

export type QueryError =
  | Readonly<{ type: 'invalid-query' }>
  | Readonly<{ type: 'node-not-found' }>
  | Readonly<{ type: 'access-denied' }>;

export interface DraftSession {
  /** Stages a batch of events onto the draft graph projection. */
  readonly applyEvents: (events: readonly GraphEvent[]) => Result<void, DraftError>;
  /** Commits staged events to the parent session if the parent revision matches. */
  readonly commit: (expectedParentRevision: string) => Promise<Result<void, DraftError>>;
  /** Discards the draft session. */
  readonly discard: () => Result<void, DraftError>;
  /** Gets the current revision of the parent graph. */
  readonly getParentRevision: () => Result<string, DraftError>;
  /** Fetches a single node from the combined projection. */
  readonly getNode: (id: NodeId) => Result<Node, QueryError>;
  /** Executes a search on the combined projection. */
  readonly queryNodes: (queryString: string) => Result<readonly Node[], QueryError>;
  /** Gets the current combined projected graph. */
  readonly graph: () => Graph;
}

/**
 * Creates a new draft session overlaying a parent graph session.
 */
export function createDraftSession(parentSession: GraphSession): DraftSession {
  // eslint-disable-next-line functional/no-let
  let stagedEvents: readonly GraphEvent[] = [];

  const graph = (): Graph => {
    const parentGraph = parentSession.graph();
    const result = projectDraftOverlay(parentGraph, stagedEvents);
    if (result.ok) {
      return result.value;
    }
    return parentGraph;
  };

  const applyEvents = (events: readonly GraphEvent[]): Result<void, DraftError> => {
    const parentGraph = parentSession.graph();
    const result = applyDraftEvents(parentGraph, stagedEvents, events);
    if (!result.ok) {
      return err({ type: 'validation-failure', message: result.error.message });
    }
    stagedEvents = result.value;
    return ok(undefined);
  };

  const commit = async (expectedParentRevision: string): Promise<Result<void, DraftError>> => {
    const parentGraph = parentSession.graph();
    const currentRevision = parentGraph.metadata.modified;
    if (currentRevision !== expectedParentRevision) {
      return err({ type: 'concurrent-modification' });
    }

    const commitResult = await parentSession.commit(stagedEvents);
    if (!commitResult.ok) {
      return err({ type: 'storage-error', message: commitResult.error.message });
    }

    stagedEvents = [];
    return ok(undefined);
  };

  const discard = (): Result<void, DraftError> => {
    stagedEvents = [];
    return ok(undefined);
  };

  const getParentRevision = (): Result<string, DraftError> => {
    const parentGraph = parentSession.graph();
    return ok(parentGraph.metadata.modified);
  };

  const getNode = (id: NodeId): Result<Node, QueryError> => {
    const currentGraph = graph();
    const node = currentGraph.nodes.get(id);
    if (!node) {
      return err({ type: 'node-not-found' });
    }
    return ok(node);
  };

  const queryNodes = (queryString: string): Result<readonly Node[], QueryError> => {
    const currentGraph = graph();
    const query = queryString.trim().toLowerCase();
    const nodes = [...currentGraph.nodes.values()];
    if (query === '') {
      return ok(nodes);
    }

    const matches = nodes.filter((node) => {
      if (node.id.toLowerCase().includes(query)) return true;
      if (node.type.toLowerCase().includes(query)) return true;

      return [...node.properties.values()].some((value) => {
        if (typeof value === 'string' && value.toLowerCase().includes(query)) {
          return true;
        }
        if (Array.isArray(value)) {
          return value.some(
            (item) => typeof item === 'string' && item.toLowerCase().includes(query),
          );
        }
        return false;
      });
    });

    return ok(matches);
  };

  return {
    applyEvents,
    commit,
    discard,
    getParentRevision,
    getNode,
    queryNodes,
    graph,
  };
}
