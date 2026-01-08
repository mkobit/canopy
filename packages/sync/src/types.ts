import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';

export interface SyncProvider {
  /**
   * connect the provider
   */
  connect(): void;

  /**
   * disconnect the provider
   */
  disconnect(): void;

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
  on(event: 'status', handler: (event: { readonly status: 'connected' | 'disconnected' | 'connecting' }) => void): void;
  off(event: 'status', handler: (event: { readonly status: 'connected' | 'disconnected' | 'connecting' }) => void): void;
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
