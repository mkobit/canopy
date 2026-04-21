import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { createGraphStore, type GraphStore } from './store/graph-store';
import type { SyncProvider, SyncEngineOptions } from './types';
import type { Result } from '@canopy/types';
import { fromThrowable } from '@canopy/types';

export interface SyncEngine {
  readonly doc: Y.Doc;
  readonly store: GraphStore;
  readonly awareness: Awareness;

  readonly setProvider: (provider: SyncProvider) => Result<void, Error>;
  readonly disconnectProvider: () => Result<void, Error>;
  readonly getSnapshot: () => Uint8Array;
  readonly applySnapshot: (snapshot: Uint8Array) => Result<void, Error>;
  readonly onDocUpdate: (
    handler: (update: Uint8Array, origin: unknown) => unknown,
  ) => Result<void, Error>;
  readonly offDocUpdate: (
    handler: (update: Uint8Array, origin: unknown) => unknown,
  ) => Result<void, Error>;
  readonly setLocalState: (state: Record<string, unknown>) => Result<void, Error>;
  readonly getAwarenessStates: () => ReadonlyMap<number, Record<string, unknown>>;
  readonly onAwarenessUpdate: (
    handler: (
      changes: Readonly<{
        added: readonly number[];
        updated: readonly number[];
        removed: readonly number[];
      }>,
      origin: unknown,
    ) => unknown,
  ) => Result<void, Error>;
  readonly offAwarenessUpdate: (
    handler: (
      changes: Readonly<{
        added: readonly number[];
        updated: readonly number[];
        removed: readonly number[];
      }>,
      origin: unknown,
    ) => unknown,
  ) => Result<void, Error>;
}

export const createSyncEngine = (options: SyncEngineOptions = {}): SyncEngine => {
  const doc = new Y.Doc();

  if (options.initialSnapshot) {
    Y.applyUpdate(doc, options.initialSnapshot);
  }

  const store = createGraphStore(doc);
  const awareness = new Awareness(doc);

  let provider: SyncProvider | null = null;

  const engine: SyncEngine = {
    doc,
    store,
    awareness,

    setProvider: (newProvider: SyncProvider): Result<void, Error> => {
      return fromThrowable(() => {
        if (provider) {
          const disconnectResult = provider.disconnect();
          // eslint-disable-next-line functional/no-throw-statements -- Re-throwing error to be caught by fromThrowable
          if (!disconnectResult.ok) throw disconnectResult.error;
        }
        provider = newProvider;
        const connectResult = newProvider.connect();
        // eslint-disable-next-line functional/no-throw-statements -- Re-throwing error to be caught by fromThrowable
        if (!connectResult.ok) throw connectResult.error;
        return;
      });
    },

    disconnectProvider: (): Result<void, Error> => {
      return fromThrowable(() => {
        if (provider) {
          const result = provider.disconnect();
          provider = null;
          // eslint-disable-next-line functional/no-throw-statements -- Re-throwing error to be caught by fromThrowable
          if (!result.ok) throw result.error;
        }
        return;
      });
    },

    getSnapshot: (): Uint8Array => {
      return Y.encodeStateAsUpdate(doc);
    },

    applySnapshot: (snapshot: Uint8Array): Result<void, Error> => {
      return fromThrowable(() => {
        Y.applyUpdate(doc, snapshot);
        return;
      });
    },

    onDocUpdate: (
      handler: (update: Uint8Array, origin: unknown) => unknown,
    ): Result<void, Error> => {
      return fromThrowable(() => {
        doc.on('update', handler);
        return;
      });
    },

    offDocUpdate: (
      handler: (update: Uint8Array, origin: unknown) => unknown,
    ): Result<void, Error> => {
      return fromThrowable(() => {
        doc.off('update', handler);
        return;
      });
    },

    setLocalState: (state: Record<string, unknown>): Result<void, Error> => {
      return fromThrowable(() => {
        awareness.setLocalState(state);
        return;
      });
    },

    getAwarenessStates: (): ReadonlyMap<number, Record<string, unknown>> => {
      return awareness.getStates();
    },

    onAwarenessUpdate: (
      handler: (
        changes: Readonly<{
          added: readonly number[];
          updated: readonly number[];
          removed: readonly number[];
        }>,
        origin: unknown,
      ) => unknown,
    ): Result<void, Error> => {
      return fromThrowable(() => {
        awareness.on('change', handler);
        return;
      });
    },

    offAwarenessUpdate: (
      handler: (
        changes: Readonly<{
          added: readonly number[];
          updated: readonly number[];
          removed: readonly number[];
        }>,
        origin: unknown,
      ) => unknown,
    ): Result<void, Error> => {
      return fromThrowable(() => {
        awareness.off('change', handler);
        return;
      });
    },
  };

  if (options.provider) {
    engine.setProvider(options.provider);
  }

  return engine;
};
