import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

// Mirrors the raw-socket NDJSON test pattern from
// packages/api-adapter/tests/ipc-server-streaming.load.test.ts.

export const getTemporarySocketPath = (label: string): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-'));
  return path.join(directory, `s-${label.slice(0, 4)}.sock`);
};

export const cleanupTemporarySocketPath = (socketPath: string): void => {
  const directory = path.dirname(socketPath);
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }
  fs.rmSync(directory, { recursive: true, force: true });
};

export const createDaemonChild = (
  daemonRoot: string,
  socketPath: string,
  databasePath?: string,
): ReturnType<typeof Bun.spawn> => {
  const entrypoint = path.join(daemonRoot, 'src', 'index.ts');
  return Bun.spawn(
    [
      process.execPath,
      entrypoint,
      '--socket-path',
      socketPath,
      ...(databasePath ? ['--db-path', databasePath] : ['--ephemeral']),
    ],
    { cwd: daemonRoot, stdout: 'pipe', stderr: 'pipe' },
  );
};

export const waitForSocketFile = async (socketPath: string, timeoutMs = 10_000): Promise<void> => {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (fs.existsSync(socketPath)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for daemon socket at ${socketPath}`);
};

export const waitForChildExit = async (
  child: ReturnType<typeof Bun.spawn>,
  timeoutMs = 10_000,
): Promise<number> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Daemon child did not exit within ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([child.exited, timedOut]);
  } catch (error) {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await child.exited;
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

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
