import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';

export interface SyncProvider {
  /**
   * connect the provider
   */
  readonly connect: () => void;

  /**
   * disconnect the provider
   */
  readonly disconnect: () => void;

  /**
   * The underlying Yjs awareness instance
   */
  readonly awareness: Awareness;

  /**
   * The underlying Yjs doc
   */
  readonly doc: Y.Doc;

  /**
   * Subscribe to connection status changes
   */
  readonly on: (event: 'status', handler: (event: Readonly<{ status: 'connected' | 'disconnected' | 'connecting' }>) => void) => void;
  readonly off: (event: 'status', handler: (event: Readonly<{ status: 'connected' | 'disconnected' | 'connecting' }>) => void) => void;
}

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
