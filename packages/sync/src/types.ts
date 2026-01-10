import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';

export interface SyncProviderState {
  /**
   * The underlying Yjs awareness instance
   */
  readonly awareness: Awareness;

  /**
   * The underlying Yjs doc
   */
  readonly doc: Y.Doc;
}

export interface SyncProviderActions {
  /**
   * connect the provider
   */
  readonly connect: () => void;

  /**
   * disconnect the provider
   */
  readonly disconnect: () => void;

  /**
   * Subscribe to connection status changes
   */
  readonly on: (event: 'status', handler: (event: Readonly<{ status: 'connected' | 'disconnected' | 'connecting' }>) => void) => void;
  readonly off: (event: 'status', handler: (event: Readonly<{ status: 'connected' | 'disconnected' | 'connecting' }>) => void) => void;
}

export type SyncProvider = SyncProviderState & SyncProviderActions;

export interface SyncEngineOptions {
  /**
   * Optional provider to start with
   */
  readonly provider?: SyncProvider;

  /**
   * Optional initial binary snapshot to load
   */
  readonly initialSnapshot?: Uint8Array;
}
