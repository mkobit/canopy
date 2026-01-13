import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { GraphStore } from './store/graph-store';
import type { SyncProvider, SyncEngineOptions } from './types';
import type { Result } from '@canopy/types';
import { fromThrowable } from '@canopy/types';

// eslint-disable-next-line functional/no-classes
export class SyncEngine {
  readonly doc: Y.Doc;
  readonly store: GraphStore;
  readonly awareness: Awareness;
  // eslint-disable-next-line functional/prefer-readonly-type
  private provider: SyncProvider | null = null;

  constructor(options: SyncEngineOptions = {}) {
    this.doc = new Y.Doc();

    if (options.initialSnapshot) {
      Y.applyUpdate(this.doc, options.initialSnapshot);
    }

    this.store = new GraphStore(this.doc);
    this.awareness = new Awareness(this.doc);

    if (options.provider) {
      this.setProvider(options.provider);
    }
  }

  setProvider(provider: SyncProvider): Result<void, Error> {
    return fromThrowable(() => {
      if (this.provider) {
        const disconnectResult = this.provider.disconnect();
        // eslint-disable-next-line functional/no-throw-statements -- Re-throwing error to be caught by fromThrowable
        if (!disconnectResult.ok) throw disconnectResult.error;
      }
      this.provider = provider;
      const connectResult = provider.connect();
      // eslint-disable-next-line functional/no-throw-statements -- Re-throwing error to be caught by fromThrowable
      if (!connectResult.ok) throw connectResult.error;
      return undefined;
    });
  }

  disconnectProvider(): Result<void, Error> {
    return fromThrowable(() => {
      if (this.provider) {
        const result = this.provider.disconnect();
        this.provider = null;
        // eslint-disable-next-line functional/no-throw-statements -- Re-throwing error to be caught by fromThrowable
        if (!result.ok) throw result.error;
        // Return is void, so we just return undefined on success
      }
      return undefined;
    });
  }

  getSnapshot(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  applySnapshot(snapshot: Uint8Array): Result<void, Error> {
    return fromThrowable(() => {
      Y.applyUpdate(this.doc, snapshot);
      return undefined;
    });
  }

  onDocUpdate(handler: (update: Uint8Array, origin: unknown) => unknown): Result<void, Error> {
    return fromThrowable(() => {
      this.doc.on('update', handler);
      return undefined;
    });
  }

  offDocUpdate(handler: (update: Uint8Array, origin: unknown) => unknown): Result<void, Error> {
    return fromThrowable(() => {
      this.doc.off('update', handler);
      return undefined;
    });
  }

  /**
   * Update local awareness state
   */
  setLocalState(state: Record<string, unknown>): Result<void, Error> {
    return fromThrowable(() => {
      this.awareness.setLocalState(state);
      return undefined;
    });
  }

  /**
   * Get all awareness states
   */
  getAwarenessStates(): ReadonlyMap<number, Record<string, unknown>> {
    return this.awareness.getStates();
  }

  onAwarenessUpdate(
    handler: (
      changes: Readonly<{
        added: readonly number[];
        updated: readonly number[];
        removed: readonly number[];
      }>,
      origin: unknown,
    ) => unknown,
  ): Result<void, Error> {
    return fromThrowable(() => {
      this.awareness.on('change', handler);
      return undefined;
    });
  }

  offAwarenessUpdate(
    handler: (
      changes: Readonly<{
        added: readonly number[];
        updated: readonly number[];
        removed: readonly number[];
      }>,
      origin: unknown,
    ) => unknown,
  ): Result<void, Error> {
    return fromThrowable(() => {
      this.awareness.off('change', handler);
      return undefined;
    });
  }
}
