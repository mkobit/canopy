import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { GraphStore } from './store/graph-store';
import { SyncProvider, SyncEngineOptions } from './types';
import { Result, ok, err } from '@canopy/types';

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
    try {
      if (this.provider) {
        const disconnectResult = this.provider.disconnect();
        if (!disconnectResult.ok) return disconnectResult;
      }
      this.provider = provider;
      return provider.connect();
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  disconnectProvider(): Result<void, Error> {
    try {
      if (this.provider) {
          const result = this.provider.disconnect();
          this.provider = null;
          return result;
      }
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  getSnapshot(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  applySnapshot(snapshot: Uint8Array): Result<void, Error> {
    try {
      Y.applyUpdate(this.doc, snapshot);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  onDocUpdate(handler: (update: Uint8Array, origin: unknown) => unknown): Result<void, Error> {
    try {
      this.doc.on('update', handler);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  offDocUpdate(handler: (update: Uint8Array, origin: unknown) => unknown): Result<void, Error> {
    try {
      this.doc.off('update', handler);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Update local awareness state
   */
  setLocalState(state: Record<string, unknown>): Result<void, Error> {
    try {
      this.awareness.setLocalState(state);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Get all awareness states
   */
  getAwarenessStates(): ReadonlyMap<number, Record<string, unknown>> {
    return this.awareness.getStates();
  }

  onAwarenessUpdate(handler: (changes: Readonly<{ added: readonly number[], updated: readonly number[], removed: readonly number[] }>, origin: unknown) => unknown): Result<void, Error> {
    try {
      this.awareness.on('change', handler);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  offAwarenessUpdate(handler: (changes: Readonly<{ added: readonly number[], updated: readonly number[], removed: readonly number[] }>, origin: unknown) => unknown): Result<void, Error> {
    try {
      this.awareness.off('change', handler);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
