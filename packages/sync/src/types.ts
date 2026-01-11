import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { Result } from '@canopy/types';

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
  readonly connect: () => Result<void, Error>;

  /**
   * disconnect the provider
   */
  readonly disconnect: () => Result<void, Error>;

  /**
   * Subscribe to connection status changes
   */
  readonly on: (
    event: 'status',
    handler: (event: Readonly<{ status: 'connected' | 'disconnected' | 'connecting' }>) => unknown,
  ) => undefined;
  readonly off: (
    event: 'status',
    handler: (event: Readonly<{ status: 'connected' | 'disconnected' | 'connecting' }>) => unknown,
  ) => undefined;
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
