import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import * as AwarenessProtocol from 'y-protocols/awareness';
import type { SyncProvider } from '../types';
import type { Result } from '@canopy/types';
import { fromThrowable } from '@canopy/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (...args: any[]) => unknown;

// Shared state for all instances to simulate network
const networks: Map<
  string,
  Set<
    SyncProvider & {
      readonly connected: boolean;
      readonly roomName: string;
      readonly broadcastDocUpdate: (update: Uint8Array) => void;
      readonly broadcastAwarenessUpdate: (update: Uint8Array) => void;
      readonly emit: (event: string, data: unknown) => void;
    }
  >
> = new Map();

export const createInMemoryProvider = (
  roomName: string,
  doc: Y.Doc,
  awareness: Awareness,
): SyncProvider => {
  let connected = false;
  const handlers: Map<string, EventHandler[]> = new Map();

  const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== provider && connected) {
      provider.broadcastDocUpdate(update);
    }
    return undefined;
  };

  const handleAwarenessUpdate = (
    {
      added,
      updated,
      removed,
    }: Readonly<{
      added: readonly number[];
      updated: readonly number[];
      removed: readonly number[];
    }>,
    origin: unknown,
  ) => {
    if (origin !== 'remote' && connected) {
      const changedClients = [...added, ...updated, ...removed];
      const update = AwarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
      provider.broadcastAwarenessUpdate(update);
    }
    return undefined;
  };

  doc.on('update', handleDocUpdate);
  awareness.on('update', handleAwarenessUpdate);

  const provider = {
    doc,
    awareness,
    get connected() {
      return connected;
    },
    roomName,

    broadcastDocUpdate: (update: Uint8Array) => {
      const network = networks.get(roomName);
      if (network) {
        // eslint-disable-next-line functional/no-loop-statements
        for (const peer of network) {
          if (peer !== provider && peer.connected) {
            Y.applyUpdate(peer.doc, update, provider);
          }
        }
      }
      return undefined;
    },

    broadcastAwarenessUpdate: (update: Uint8Array) => {
      const network = networks.get(roomName);
      if (network) {
        // eslint-disable-next-line functional/no-loop-statements
        for (const peer of network) {
          if (peer !== provider && peer.connected) {
            AwarenessProtocol.applyAwarenessUpdate(peer.awareness, update, 'remote');
          }
        }
      }
      return undefined;
    },

    connect: (): Result<void, Error> => {
      return fromThrowable(() => {
        if (!networks.has(roomName)) {
          networks.set(roomName, new Set());
        }
        networks.get(roomName)!.add(provider);
        connected = true;

        const network = networks.get(roomName);
        if (network) {
          // eslint-disable-next-line functional/no-loop-statements
          for (const peer of network) {
            if (peer !== provider && peer.connected) {
              // Sync step 1
              const stateVector = Y.encodeStateVector(doc);
              const diff = Y.encodeStateAsUpdate(peer.doc, stateVector);
              Y.applyUpdate(doc, diff, provider);

              // Sync step 2
              const peerStateVector = Y.encodeStateVector(peer.doc);
              const myDiff = Y.encodeStateAsUpdate(doc, peerStateVector);
              Y.applyUpdate(peer.doc, myDiff, provider);

              // Sync Awareness
              const myAwarenessUpdate = AwarenessProtocol.encodeAwarenessUpdate(awareness, [
                doc.clientID,
              ]);
              AwarenessProtocol.applyAwarenessUpdate(peer.awareness, myAwarenessUpdate, 'remote');

              const peerAwarenessUpdate = AwarenessProtocol.encodeAwarenessUpdate(peer.awareness, [
                ...peer.awareness.getStates().keys(),
              ]);
              AwarenessProtocol.applyAwarenessUpdate(awareness, peerAwarenessUpdate, 'remote');
            }
          }
        }
        provider.emit('status', { status: 'connected' });
        return undefined;
      });
    },

    disconnect: (): Result<void, Error> => {
      return fromThrowable(() => {
        const network = networks.get(roomName);
        if (network) {
          network.delete(provider);
          if (network.size === 0) {
            networks.delete(roomName);
          }
        }
        connected = false;
        provider.emit('status', { status: 'disconnected' });
        return undefined;
      });
    },

    on: (
      event: 'status',
      handler: (
        event: Readonly<{ status: 'connected' | 'disconnected' | 'connecting' }>,
      ) => unknown,
    ) => {
      if (!handlers.has(event)) {
        handlers.set(event, []);
      }
      handlers.get(event)?.push(handler);
      return undefined;
    },

    off: (
      event: 'status',
      handler: (
        event: Readonly<{ status: 'connected' | 'disconnected' | 'connecting' }>,
      ) => unknown,
    ) => {
      const eventHandlers = handlers.get(event);
      if (eventHandlers) {
        handlers.set(
          event,
          eventHandlers.filter((h) => h !== handler),
        );
      }
      return undefined;
    },

    emit: (event: string, data: unknown) => {
      const eventHandlers = handlers.get(event);
      if (eventHandlers) {
        // eslint-disable-next-line functional/no-loop-statements
        for (const h of eventHandlers) {
          h(data);
        }
      }
      return undefined;
    },
  };

  return provider;
};
