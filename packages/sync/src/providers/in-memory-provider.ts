import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import * as AwarenessProtocol from 'y-protocols/awareness';
import type { SyncProvider } from '../types';
import type { Result} from '@canopy/types';
import { ok, err } from '@canopy/types';

export class InMemoryProvider implements SyncProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  // eslint-disable-next-line functional/prefer-readonly-type
  connected = false;
  // eslint-disable-next-line @typescript-eslint/ban-types, functional/prefer-readonly-type
  readonly handlers: Map<string, Function[]> = new Map<string, Function[]>();

  // Shared state for all instances to simulate network
  // eslint-disable-next-line functional/prefer-readonly-type
  static readonly networks: Map<string, Set<InMemoryProvider>> = new Map<string, Set<InMemoryProvider>>();
  readonly roomName: string;

  constructor(roomName: string, doc: Y.Doc, awareness: Awareness) {
    this.doc = doc;
    this.awareness = awareness;
    this.roomName = roomName;

    // Listen to local updates and broadcast
    this.doc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);
  }

  private readonly handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== this && this.connected) {
      this.broadcastDocUpdate(update);
    }
    return undefined;
  };

  private readonly handleAwarenessUpdate = ({ added, updated, removed }: Readonly<{ added: readonly number[], updated: readonly number[], removed: readonly number[] }>, origin: unknown) => {
    if (origin !== 'remote' && this.connected) {
      const changedClients = added.concat(updated).concat(removed);
      const update = AwarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
      this.broadcastAwarenessUpdate(update);
    }
    return undefined;
  };

  broadcastDocUpdate(update: Uint8Array) {
    const network = InMemoryProvider.networks.get(this.roomName);
    if (network) {
      network.forEach(peer => {
        if (peer !== this && peer.connected) {
          Y.applyUpdate(peer.doc, update, this);
        }
        return undefined;
      });
    }
    return undefined;
  }

  broadcastAwarenessUpdate(update: Uint8Array) {
    const network = InMemoryProvider.networks.get(this.roomName);
    if (network) {
      network.forEach(peer => {
        if (peer !== this && peer.connected) {
          AwarenessProtocol.applyAwarenessUpdate(peer.awareness, update, 'remote');
        }
        return undefined;
      });
    }
    return undefined;
  }

  connect(): Result<void, Error> {
    try {
      if (!InMemoryProvider.networks.has(this.roomName)) {
        InMemoryProvider.networks.set(this.roomName, new Set());
      }
      InMemoryProvider.networks.get(this.roomName)!.add(this);
      this.connected = true;

      // Sync with existing peers?
      // In a real provider we would do a sync handshake.
      // For this simple mock, we might rely on the fact that if we join, we might miss history unless we sync.
      // But Yjs is resilient.
      // Let's iterate peers and apply their state.
      const network = InMemoryProvider.networks.get(this.roomName);
      if (network) {
        network.forEach(peer => {
          if (peer !== this && peer.connected) {
            // Sync step 1
            const stateVector = Y.encodeStateVector(this.doc);
            const diff = Y.encodeStateAsUpdate(peer.doc, stateVector);
            Y.applyUpdate(this.doc, diff, this);

            // Sync step 2 (peer needs my updates)
            const peerStateVector = Y.encodeStateVector(peer.doc);
            const myDiff = Y.encodeStateAsUpdate(this.doc, peerStateVector);
            Y.applyUpdate(peer.doc, myDiff, this);

            // Sync Awareness
            // Send my state to peer
            const myAwarenessUpdate = AwarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
            AwarenessProtocol.applyAwarenessUpdate(peer.awareness, myAwarenessUpdate, 'remote');

            // Get peer state
            // Note: encodeAwarenessUpdate with [clientId] gets that client's state.
            // But we don't know all client IDs easily without iterating.
            // Awareness protocol usually syncs everything.
            // For now let's just push ours. The peer should push theirs back if we had a full handshake.
            // Let's cheat and push peer's state to us.
            const peerAwarenessUpdate = AwarenessProtocol.encodeAwarenessUpdate(peer.awareness, Array.from(peer.awareness.getStates().keys()));
            AwarenessProtocol.applyAwarenessUpdate(this.awareness, peerAwarenessUpdate, 'remote');
          }
          return undefined;
        });
      }

      this.emit('status', { status: 'connected' });
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  disconnect(): Result<void, Error> {
    try {
      const network = InMemoryProvider.networks.get(this.roomName);
      if (network) {
          network.delete(this);
          if (network.size === 0) {
              InMemoryProvider.networks.delete(this.roomName);
          }
      }
      this.connected = false;
      this.emit('status', { status: 'disconnected' });
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  on(event: 'status', handler: (event: Readonly<{ status: 'connected' | 'disconnected' | 'connecting' }>) => unknown) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)?.push(handler);
    return undefined;
  }

  off(event: 'status', handler: (event: Readonly<{ status: 'connected' | 'disconnected' | 'connecting' }>) => unknown) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      this.handlers.set(event, handlers.filter(h => h !== handler));
    }
    return undefined;
  }

  emit(event: string, data: unknown) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    this.handlers.get(event)?.forEach((h: Function) => h(data));
    return undefined;
  }
}
