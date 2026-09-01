/* eslint-disable functional/no-return-void, max-lines-per-function, functional/prefer-immutable-types */
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import type { Result } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
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
    const onDrain = (): void => {
      clearTimeout(drainTimer);
      socket.removeListener('drain', onDrain);
    };

    const drainTimer = setTimeout(() => {
      socket.removeListener('drain', onDrain);
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
  const activeSockets = { current: new Set<net.Socket>() };
  const activeSubscriptions = {
    current: new Map<net.Socket, ReadonlyMap<string, () => void>>(),
  };
  // Per-connection draft registries. Ephemeral and connection-scoped by design (design.md "No new
  // persistence for draft state") -- never written to the event log or any store, and cleared
  // whenever the owning socket closes (task 5.7 / "Cleanup on disconnect").
  const activeDraftRegistries = {
    current: new Map<net.Socket, ReadonlyMap<string, DraftRegistryEntry>>(),
  };

  const netServer = { current: undefined as net.Server | undefined };
  const isListening = { current: false };

  const cleanupSocketSubscriptions = (socket: net.Socket): void => {
    const subs = activeSubscriptions.current.get(socket);
    if (subs) {
      // eslint-disable-next-line functional/no-loop-statements
      for (const unbind of subs.values()) {
        unbind();
      }
      activeSubscriptions.current = new Map(
        [...activeSubscriptions.current].filter(([s]) => s !== socket),
      );
    }
  };

  const cleanupSocketDrafts = (socket: net.Socket): void => {
    const drafts = activeDraftRegistries.current.get(socket);
    if (drafts) {
      // eslint-disable-next-line functional/no-loop-statements
      for (const entry of drafts.values()) {
        entry.session.discard();
      }
      activeDraftRegistries.current = new Map(
        [...activeDraftRegistries.current].filter(([s]) => s !== socket),
      );
    }
  };

  // Sum of live draft counts across every connection, used to enforce the global concurrent-draft
  // cap in ipc-handlers.ts's draft.create case.
  const totalDraftCount = (): number =>
    activeDraftRegistries.current.values().reduce((sum, drafts) => sum + drafts.size, 0);

  const handleConnection = (socket: net.Socket): void => {
    activeSockets.current = new Set([...activeSockets.current, socket]);
    activeSubscriptions.current = new Map([...activeSubscriptions.current, [socket, new Map()]]);
    activeDraftRegistries.current = new Map([
      ...activeDraftRegistries.current,
      [socket, new Map()],
    ]);

    const streamBuffer = { current: '' };

    socket.on('data', (chunk: Buffer) => {
      const combined = streamBuffer.current + chunk.toString('utf8');

      if (combined.length > MAX_LINE_BYTES && !combined.includes('\n')) {
        // Oversized line without newline delimiter - destroy socket for memory safety
        socket.destroy();
        return;
      }

      const lastNewline = combined.lastIndexOf('\n');
      if (lastNewline === -1) {
        streamBuffer.current = combined;
        return;
      }

      const completeLines = combined.slice(0, lastNewline).split('\n');
      streamBuffer.current = combined.slice(lastNewline + 1);

      // eslint-disable-next-line functional/no-loop-statements
      for (const rawLine of completeLines) {
        const line = rawLine.trim();
        if (line.length > 0) {
          // Process message asynchronously
          const draftsMap =
            activeDraftRegistries.current.get(socket) ?? new Map<string, DraftRegistryEntry>();
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
              const subsMap = activeSubscriptions.current.get(socket);
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
                const nextSubsMap = new Map([
                  ...subsMap,
                  [
                    subscriptionId,
                    () => {
                      unbindListener();
                      subscriber.close();
                    },
                  ],
                ]);
                activeSubscriptions.current = new Map([
                  ...activeSubscriptions.current,
                  [socket, nextSubsMap],
                ]);
              }
            }

            if (unsubscribeId) {
              const subsMap = activeSubscriptions.current.get(socket);
              if (subsMap) {
                const closeFunction = subsMap.get(unsubscribeId);
                if (closeFunction) {
                  closeFunction();
                  const nextSubsMap = new Map([...subsMap].filter(([id]) => id !== unsubscribeId));
                  activeSubscriptions.current = new Map([
                    ...activeSubscriptions.current,
                    [socket, nextSubsMap],
                  ]);
                }
              }
            }

            // Apply draft registry mutations reported by ipc-handlers.ts. ipc-server.ts is the sole
            // owner/writer of this socket's draft map, mirroring the subscription pattern above.
            const socketDrafts = activeDraftRegistries.current.get(socket);
            if (socketDrafts) {
              const withNewDraft = newDraft
                ? new Map([...socketDrafts, [newDraft.draftId, newDraft.entry]])
                : socketDrafts;
              const withTouchDraft = touchDraft
                ? (() => {
                    const existing = withNewDraft.get(touchDraft.draftId);
                    return existing
                      ? new Map([
                          ...withNewDraft,
                          [
                            touchDraft.draftId,
                            {
                              ...existing,
                              lastTouchedAt: Temporal.Now.instant().epochMilliseconds,
                              ...(touchDraft.stagedEventCount !== undefined && {
                                stagedEventCount: touchDraft.stagedEventCount,
                              }),
                            },
                          ],
                        ])
                      : withNewDraft;
                  })()
                : withNewDraft;
              const updatedDrafts = dropDraftIds
                ? new Map(
                    [...withTouchDraft].filter(([draftId]) => !new Set(dropDraftIds).has(draftId)),
                  )
                : withTouchDraft;
              if (updatedDrafts !== socketDrafts) {
                activeDraftRegistries.current = new Map([
                  ...activeDraftRegistries.current,
                  [socket, updatedDrafts],
                ]);
              }
            }
            return undefined;
          });
        }
      }
    });

    const onCloseOrError = (): void => {
      cleanupSocketSubscriptions(socket);
      cleanupSocketDrafts(socket);
      activeSockets.current = new Set([...activeSockets.current].filter((s) => s !== socket));
    };

    socket.on('close', onCloseOrError);
    socket.on('error', onCloseOrError);
  };

  const listen = async (): Promise<Result<void, IpcSocketInUseError | IpcProtocolError>> => {
    if (isListening.current) {
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
        netServer.current = server;

        const oldUmask = process.umask(0o177);
        // eslint-disable-next-line functional/no-try-statements
        try {
          server.listen(socketPath, () => {
            isListening.current = true;
            resolve(ok(undefined));
          });
        } finally {
          process.umask(oldUmask);
        }

        server.on('error', (error: Error) => {
          if (!isListening.current) {
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
    if (!isListening.current && !netServer.current) {
      return;
    }

    isListening.current = false;

    // eslint-disable-next-line functional/no-loop-statements
    for (const socket of activeSockets.current) {
      cleanupSocketSubscriptions(socket);
      cleanupSocketDrafts(socket);
      socket.destroy();
    }
    activeSockets.current = new Set();
    activeSubscriptions.current = new Map();
    activeDraftRegistries.current = new Map();

    return new Promise((resolve) => {
      if (netServer.current) {
        netServer.current.close(() => {
          netServer.current = undefined;
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
    getActiveConnectionCount: () => activeSockets.current.size,
  };
};
