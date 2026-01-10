import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { GraphStore } from './store/graph-store';
import { SyncProvider, SyncEngineOptions } from './types';

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

  setProvider(provider: SyncProvider) {
    if (this.provider) {
      this.provider.disconnect();
    }
    this.provider = provider;

    // We might need to sync awareness states if the provider uses a different awareness instance?
    // Usually provider takes the doc and awareness.
    // In our abstraction, if the provider has its own awareness, we might need to link them
    // or we assume the provider uses OUR doc and awareness.

    // BUT the provider interface I defined has `awareness` as a property.
    // If we passed the provider in, it likely already has a doc/awareness or we gave it one.
    // A clearer pattern is: we create the Doc, we create the Awareness, then we create the Provider passing those.
    // But `setProvider` implies we can swap them.

    // If the provider was created externally, it might be attached to a different Doc.
    // Let's assume the provider is initialized with THIS doc/awareness before being passed, OR
    // we use the provider's doc/awareness if we didn't have one? No, we own the Doc.

    // Refined approach: Provider wraps our Doc and Awareness.
    // But `y-websocket` takes `doc` in constructor.

    // So `setProvider` is just storing the reference and calling connect.
    provider.connect();
    return undefined;
  }

  disconnectProvider() {
      if (this.provider) {
          this.provider.disconnect();
          this.provider = null;
      }
      return undefined;
  }

  getSnapshot(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  applySnapshot(snapshot: Uint8Array) {
    Y.applyUpdate(this.doc, snapshot);
    return undefined;
  }

  onDocUpdate(handler: (update: Uint8Array, origin: unknown) => unknown) {
    this.doc.on('update', handler);
    return undefined;
  }

  offDocUpdate(handler: (update: Uint8Array, origin: unknown) => unknown) {
      this.doc.off('update', handler);
      return undefined;
  }

  /**
   * Update local awareness state
   */
  setLocalState(state: Record<string, unknown>) {
    this.awareness.setLocalState(state);
    return undefined;
  }

  /**
   * Get all awareness states
   */
  getAwarenessStates(): ReadonlyMap<number, Record<string, unknown>> {
    return this.awareness.getStates();
  }

  onAwarenessUpdate(handler: (changes: Readonly<{ added: readonly number[], updated: readonly number[], removed: readonly number[] }>, origin: unknown) => unknown) {
      this.awareness.on('change', handler);
      return undefined;
  }

  offAwarenessUpdate(handler: (changes: Readonly<{ added: readonly number[], updated: readonly number[], removed: readonly number[] }>, origin: unknown) => unknown) {
      this.awareness.off('change', handler);
      return undefined;
  }
}
