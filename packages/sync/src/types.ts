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
  awareness: Awareness;

  /**
   * The underlying Yjs doc
   */
  doc: Y.Doc;

  /**
   * Subscribe to connection status changes
   */
  on(event: 'status', handler: (event: { status: 'connected' | 'disconnected' | 'connecting' }) => void): void;
  off(event: 'status', handler: (event: { status: 'connected' | 'disconnected' | 'connecting' }) => void): void;
}

export interface SyncEngineOptions {
  /**
   * Optional provider to start with
   */
  provider?: SyncProvider;

  /**
   * Optional initial binary snapshot to load
   */
  initialSnapshot?: Uint8Array;
}
