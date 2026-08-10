import * as crypto from 'node:crypto';
import * as net from 'node:net';
import * as path from 'node:path';

// Mirrors the raw-socket NDJSON test pattern from
// packages/api-adapter/tests/ipc-server-streaming.load.test.ts.

export const getTemporarySocketPath = (label: string): string =>
  path.join(process.cwd(), 'tmp', `test-daemon-${label}-${crypto.randomUUID()}.sock`);

export type JsonRpcLine = Readonly<{
  id?: number;
  result?: Readonly<Record<string, unknown>>;
  error?: Readonly<{ code: number; message: string; data?: unknown }>;
  method?: string;
  params?: Readonly<Record<string, unknown>>;
}>;

// Minimal NDJSON line reassembly for a raw net.Socket.
export const onEachLine = (socket: net.Socket, handleLine: (line: JsonRpcLine) => void): void => {
  let buffer = '';
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        handleLine(JSON.parse(line) as JsonRpcLine);
      }
      newlineIndex = buffer.indexOf('\n');
    }
  });
};

export const connect = async (socketPath: string): Promise<net.Socket> => {
  const client = net.connect(socketPath);
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });
  return client;
};

export type JsonRpcTestClient = Readonly<{
  send: (method: string, parameters?: Readonly<Record<string, unknown>>) => Promise<JsonRpcLine>;
}>;

// Wraps a connected socket with a single persistent line listener (rather
// than one per call) and a pending-request map keyed by id, mirroring the
// `pending`-map pattern in ipc-server-streaming.load.test.ts.
export const makeJsonRpcTestClient = (socket: net.Socket): JsonRpcTestClient => {
  let nextId = 0;
  const pending = new Map<number, (line: JsonRpcLine) => void>();

  onEachLine(socket, (line) => {
    if (typeof line.id !== 'number') {
      return;
    }

    pending.get(line.id)?.(line);
    pending.delete(line.id);
  });

  return {
    send: (method, parameters = {}) =>
      new Promise((resolve) => {
        nextId += 1;
        const id = nextId;
        pending.set(id, resolve);
        socket.write(`${JSON.stringify({ jsonrpc: '2.0', method, params: parameters, id })}\n`);
      }),
  };
};
