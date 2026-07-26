/* eslint-disable functional/no-return-void, max-lines-per-function, functional/prefer-immutable-types */
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import type { Result } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import type { ApiAdapterContext } from '../api-context';
import { handleIpcRequestLine } from './ipc-handlers';
import type { IpcProtocolError, IpcSocketInUseError } from './ipc-schema';
import {
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

  const handleConnection = (socket: net.Socket): void => {
    // eslint-disable-next-line functional/immutable-data
    activeSockets.add(socket);
    // eslint-disable-next-line functional/immutable-data
    activeSubscriptions.set(socket, new Map<string, () => void>());

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
          void handleIpcRequestLine(line, context).then((res) => {
            if (!res.ok) {
              const errResp = {
                jsonrpc: '2.0',
                error: {
                  code: res.error.code,
                  message: res.error.message,
                },
                id: null,
              };
              sendToSocket(socket, JSON.stringify(errResp));
              return undefined;
            }

            const { response, newSubscription, unsubscribeId } = res.value;

            if (response) {
              sendToSocket(socket, JSON.stringify(response));
            }

            if (newSubscription) {
              const subsMap = activeSubscriptions.get(socket);
              if (subsMap) {
                // eslint-disable-next-line functional/immutable-data
                subsMap.set(newSubscription.subscriptionId, newSubscription.close);
              }
            }

            if (unsubscribeId) {
              const subsMap = activeSubscriptions.get(socket);
              if (subsMap) {
                const closeFn = subsMap.get(unsubscribeId);
                if (closeFn) {
                  closeFn();
                  // eslint-disable-next-line functional/immutable-data
                  subsMap.delete(unsubscribeId);
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

    const probeRes = await probeSocketPath(socketPath);
    if (!probeRes.ok) {
      return err(probeRes.error);
    }

    const parentDir = path.dirname(socketPath);
    // eslint-disable-next-line functional/no-try-statements
    try {
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
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
      socket.destroy();
    }
    // eslint-disable-next-line functional/immutable-data
    activeSockets.clear();
    // eslint-disable-next-line functional/immutable-data
    activeSubscriptions.clear();

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
