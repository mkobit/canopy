/* eslint-disable functional/no-return-void, max-lines-per-function, functional/prefer-immutable-types */
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import type { Result } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';
import type { ApiAdapterContext } from '../api-context';
import type { DraftRegistryEntry } from './ipc-handlers';
import { handleIpcRequestLine } from './ipc-handlers';
import type { IpcProtocolError, IpcSocketInUseError } from './ipc-schema';
import {
  IPC_METHODS,
  JSON_RPC_ERROR_CODES,
  createIpcProtocolError,
  createIpcSocketInUseError,
} from './ipc-schema';

export type IpcServerOptions = Readonly<{
  socketPath: string;
  context: ApiAdapterContext;
}>;

export interface IpcServer {
  readonly listen: () => Promise<Result<void, IpcSocketInUseError | IpcProtocolError>>;
  readonly close: () => Promise<void>;
  readonly getSocketPath: () => string;
  readonly getActiveConnectionCount: () => number;
}

const MAX_LINE_BYTES = 10 * 1024 * 1024; // 10MB limit

// Sends NDJSON line over a socket with 15-second slow-consumer backpressure drain timeout.
const sendToSocket = (
  socket: net.Socket,
  payload: string,
  onDrainTimeout?: (() => void) | undefined,
): boolean => {
  if (socket.destroyed || !socket.writable) return false;

  const canWrite = socket.write(`${payload}\n`);
  if (!canWrite) {
    // eslint-disable-next-line functional/no-let
    let drainTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (drainTimer !== undefined) {
        clearTimeout(drainTimer);
        drainTimer = undefined;
      }
      socket.removeListener('drain', onDrain);
    };

    const onDrain = (): void => {
      cleanup();
    };

    drainTimer = setTimeout(() => {
      cleanup();
      onDrainTimeout?.();
      socket.destroy();
    }, 15_000);

    socket.once('drain', onDrain);
  }
  return canWrite;
};

// Probes target socket path to detect active listener vs stale socket file.
const probeSocketPath = (socketPath: string): Promise<Result<boolean, IpcSocketInUseError>> => {
  return new Promise((resolve) => {
    if (!fs.existsSync(socketPath)) {
      resolve(ok(true));
      return;
    }

    const client = net.connect(socketPath);

    client.on('connect', () => {
      client.destroy();
      resolve(err(createIpcSocketInUseError(socketPath)));
    });

    client.on('error', () => {
      client.destroy();
      // eslint-disable-next-line functional/no-try-statements
      try {
        if (fs.existsSync(socketPath)) {
          fs.unlinkSync(socketPath);
        }
      } catch {
        // Ignore stale socket unlink failures
      }
      resolve(ok(true));
    });
  });
};

export const createIpcServer = (options: IpcServerOptions): IpcServer => {
  const { socketPath, context } = options;
  const activeSockets = new Set<net.Socket>();
  const activeSubscriptions = new Map<net.Socket, Map<string, () => void>>();
  // Per-connection draft registries. Ephemeral and connection-scoped by design (design.md "No new
  // persistence for draft state") -- never written to the event log or any store, and cleared
  // whenever the owning socket closes (task 5.7 / "Cleanup on disconnect").
  const activeDraftRegistries = new Map<net.Socket, Map<string, DraftRegistryEntry>>();

  // eslint-disable-next-line functional/no-let
  let netServer: net.Server | undefined;
  // eslint-disable-next-line functional/no-let
  let isListening = false;

  const cleanupSocketSubscriptions = (socket: net.Socket): void => {
    const subs = activeSubscriptions.get(socket);
    if (subs) {
      // eslint-disable-next-line functional/no-loop-statements
      for (const unbind of subs.values()) {
        unbind();
      }
      // eslint-disable-next-line functional/immutable-data
      subs.clear();
      // eslint-disable-next-line functional/immutable-data
      activeSubscriptions.delete(socket);
    }
  };

  const cleanupSocketDrafts = (socket: net.Socket): void => {
    const drafts = activeDraftRegistries.get(socket);
    if (drafts) {
      // eslint-disable-next-line functional/no-loop-statements
      for (const entry of drafts.values()) {
        entry.session.discard();
      }
      // eslint-disable-next-line functional/immutable-data
      drafts.clear();
      // eslint-disable-next-line functional/immutable-data
      activeDraftRegistries.delete(socket);
    }
  };

  // Sum of live draft counts across every connection, used to enforce the global concurrent-draft
  // cap in ipc-handlers.ts's draft.create case.
  const totalDraftCount = (): number =>
    activeDraftRegistries.values().reduce((sum, drafts) => sum + drafts.size, 0);

  const handleConnection = (socket: net.Socket): void => {
    // eslint-disable-next-line functional/immutable-data
    activeSockets.add(socket);
    // eslint-disable-next-line functional/immutable-data
    activeSubscriptions.set(socket, new Map<string, () => void>());
    // eslint-disable-next-line functional/immutable-data
    activeDraftRegistries.set(socket, new Map<string, DraftRegistryEntry>());

    // eslint-disable-next-line functional/no-let
    let buffer = '';

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');

      if (buffer.length > MAX_LINE_BYTES && !buffer.includes('\n')) {
        // Oversized line without newline delimiter - destroy socket for memory safety
        socket.destroy();
        return;
      }

      // eslint-disable-next-line functional/no-let
      let newlineIndex = buffer.indexOf('\n');
      // eslint-disable-next-line functional/no-loop-statements
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          // Process message asynchronously
          const draftsMap =
            activeDraftRegistries.get(socket) ?? new Map<string, DraftRegistryEntry>();
          void handleIpcRequestLine(line, context, draftsMap, totalDraftCount()).then((result) => {
            if (!result.ok) {
              const errorResp = {
                jsonrpc: '2.0',
                error: {
                  code: result.error.code,
                  message: result.error.message,
                },
                id: null,
              };
              sendToSocket(socket, JSON.stringify(errorResp));
              return undefined;
            }

            const { response, newSubscription, unsubscribeId, newDraft, dropDraftIds, touchDraft } =
              result.value;

            if (response) {
              sendToSocket(socket, JSON.stringify(response));
            }

            if (newSubscription) {
              const subsMap = activeSubscriptions.get(socket);
              if (subsMap) {
                const { subscriptionId, subscriber } = newSubscription;
                const unbindListener = subscriber.subscribe((message) => {
                  if (message.kind !== 'event' || !message.event) {
                    return;
                  }
                  sendToSocket(
                    socket,
                    JSON.stringify({
                      jsonrpc: '2.0',
                      method: IPC_METHODS.EVENT_STREAM_EVENT,
                      params: { subscriptionId, event: message.event },
                    }),
                  );
                });
                // eslint-disable-next-line functional/immutable-data
                subsMap.set(subscriptionId, () => {
                  unbindListener();
                  subscriber.close();
                });
              }
            }

            if (unsubscribeId) {
              const subsMap = activeSubscriptions.get(socket);
              if (subsMap) {
                const closeFunction = subsMap.get(unsubscribeId);
                if (closeFunction) {
                  closeFunction();
                  // eslint-disable-next-line functional/immutable-data
                  subsMap.delete(unsubscribeId);
                }
              }
            }

            // Apply draft registry mutations reported by ipc-handlers.ts. ipc-server.ts is the sole
            // owner/writer of this socket's draft map, mirroring the subscription pattern above.
            const socketDrafts = activeDraftRegistries.get(socket);
            if (socketDrafts) {
              if (newDraft) {
                // eslint-disable-next-line functional/immutable-data
                socketDrafts.set(newDraft.draftId, newDraft.entry);
              }
              if (touchDraft) {
                const existing = socketDrafts.get(touchDraft.draftId);
                if (existing) {
                  // eslint-disable-next-line functional/immutable-data
                  socketDrafts.set(touchDraft.draftId, {
                    ...existing,
                    lastTouchedAt: Temporal.Now.instant().epochMilliseconds,
                    ...(touchDraft.stagedEventCount !== undefined && {
                      stagedEventCount: touchDraft.stagedEventCount,
                    }),
                  });
                }
              }
              if (dropDraftIds) {
                // eslint-disable-next-line functional/no-loop-statements
                for (const draftId of dropDraftIds) {
                  // eslint-disable-next-line functional/immutable-data
                  socketDrafts.delete(draftId);
                }
              }
            }
            return undefined;
          });
        }

        newlineIndex = buffer.indexOf('\n');
      }
    });

    const onCloseOrError = (): void => {
      cleanupSocketSubscriptions(socket);
      cleanupSocketDrafts(socket);
      // eslint-disable-next-line functional/immutable-data
      activeSockets.delete(socket);
    };

    socket.on('close', onCloseOrError);
    socket.on('error', onCloseOrError);
  };

  const listen = async (): Promise<Result<void, IpcSocketInUseError | IpcProtocolError>> => {
    if (isListening) {
      return ok(undefined);
    }

    const probeResult = await probeSocketPath(socketPath);
    if (!probeResult.ok) {
      return err(probeResult.error);
    }

    const parentDirectory = path.dirname(socketPath);
    // eslint-disable-next-line functional/no-try-statements
    try {
      if (!fs.existsSync(parentDirectory)) {
        fs.mkdirSync(parentDirectory, { recursive: true, mode: 0o700 });
      }
    } catch (error) {
      return err(
        createIpcProtocolError(
          JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          `Failed to create IPC runtime directory: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    return new Promise((resolve) => {
      // eslint-disable-next-line functional/no-try-statements
      try {
        const server = net.createServer(handleConnection);
        netServer = server;

        const oldUmask = process.umask(0o177);
        // eslint-disable-next-line functional/no-try-statements
        try {
          server.listen(socketPath, () => {
            isListening = true;
            resolve(ok(undefined));
          });
        } finally {
          process.umask(oldUmask);
        }

        server.on('error', (error: Error) => {
          if (!isListening) {
            resolve(
              err(
                createIpcProtocolError(
                  JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                  `Server listen error: ${error.message}`,
                ),
              ),
            );
          }
        });
      } catch (error) {
        resolve(
          err(
            createIpcProtocolError(
              JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
              `Failed to create IPC net server: ${error instanceof Error ? error.message : String(error)}`,
            ),
          ),
        );
      }
    });
  };

  const close = async (): Promise<void> => {
    if (!isListening && !netServer) {
      return;
    }

    isListening = false;

    // eslint-disable-next-line functional/no-loop-statements
    for (const socket of activeSockets) {
      cleanupSocketSubscriptions(socket);
      cleanupSocketDrafts(socket);
      socket.destroy();
    }
    // eslint-disable-next-line functional/immutable-data
    activeSockets.clear();
    // eslint-disable-next-line functional/immutable-data
    activeSubscriptions.clear();
    // eslint-disable-next-line functional/immutable-data
    activeDraftRegistries.clear();

    return new Promise((resolve) => {
      if (netServer) {
        netServer.close(() => {
          netServer = undefined;
          if (fs.existsSync(socketPath)) {
            // eslint-disable-next-line functional/no-try-statements
            try {
              fs.unlinkSync(socketPath);
            } catch {
              // Ignore unlink errors during shutdown
            }
          }
          resolve();
        });
      } else {
        if (fs.existsSync(socketPath)) {
          // eslint-disable-next-line functional/no-try-statements
          try {
            fs.unlinkSync(socketPath);
          } catch {
            // Ignore
          }
        }
        resolve();
      }
    });
  };

  return {
    listen,
    close,
    getSocketPath: () => socketPath,
    getActiveConnectionCount: () => activeSockets.size,
  };
};
