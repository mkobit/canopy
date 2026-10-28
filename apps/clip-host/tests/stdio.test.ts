import { expect, it } from 'bun:test';
import { fork } from 'node:child_process';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_FRAME_BYTES, decodeFrames, encodeFrame } from '../src/framing';

const frame = (id: number) => {
  const result = encodeFrame({ jsonrpc: '2.0', id, method: 'canopy.v1.handshake' });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

it('Child-process fragmentation, combined frames, independent replies and frame rejection recovery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'clip-stdio-'));
  const socketPath = join(directory, 'daemon.sock');
  const peers: Socket[] = [];
  const held: (() => void)[] = [];
  const server = createServer((socket) => {
    peers.push(socket);
    let pending = '';
    socket.on('data', (chunk) => {
      pending += chunk.toString();
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const request = JSON.parse(line) as { id: number; method: string };
        const respond = () =>
          socket.write(
            JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: { apiVersion: 'v1', serverVersion: 'stdio-test', capabilities: [] },
            }) + '\n',
          );
        if (request.method === 'canopy.v1.handshake' && held.length === 0) held.push(respond);
        else respond();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  const child = fork(new URL('stdio-launcher.ts', import.meta.url), [], {
    execPath: process.execPath,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, CANOPY_SOCKET_PATH: socketPath },
  });
  const childExited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  let consumed = 0;
  let ready = false;
  let stdout = Buffer.alloc(0);
  let stderr = '';
  child.on('message', (message: unknown) => {
    const value = message as { consumed?: number; ready?: boolean };
    consumed += value.consumed ?? 0;
    ready ||= value.ready ?? false;
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout = Buffer.concat([stdout, chunk]);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const waitFor = async (predicate: () => boolean) => {
    const deadline = performance.now() + 10_000;
    while (!predicate()) {
      if (performance.now() > deadline || child.exitCode !== null)
        throw new Error(`child timeout/exit: ${stderr}`);
      await Bun.sleep(5);
    }
  };
  const send = async (bytes: Buffer) => {
    const target = consumed + bytes.length;
    child.stdin?.write(bytes);
    await waitFor(() => consumed >= target);
  };
  const responses = () => {
    const decoded = decodeFrames(stdout);
    if (!decoded.ok) throw new Error(`non-frame stdout: ${stdout.toString()}`);
    return decoded.value;
  };
  try {
    await waitFor(() => ready);
    const first = frame(1);
    for (const fragment of [
      first.subarray(0, 1),
      first.subarray(1, 3),
      first.subarray(3, 7),
      first.subarray(7),
    ])
      await send(fragment);
    await waitFor(() => held.length === 1);
    await send(Buffer.concat([frame(2), frame(3)]));
    await waitFor(() => responses().messages.length === 2);
    expect(responses().messages.map((message) => (message as { id: number }).id)).toEqual([2, 3]);
    held[0]?.();
    await waitFor(() => responses().messages.length === 3);
    expect(responses().messages.map((message) => (message as { id: number }).id)).toEqual([
      2, 3, 1,
    ]);
    const oversize = Buffer.alloc(4);
    oversize.writeUInt32LE(MAX_FRAME_BYTES + 1);
    for (const [bad, id] of [
      [Buffer.from([1, 0, 0, 0, 123]), 4],
      [oversize, 5],
    ] as const) {
      await send(bad);
      await send(frame(id));
      await waitFor(() => responses().messages.length === id);
      expect((responses().messages.at(-1) as { id: number }).id).toBe(id);
    }
    expect(responses().messages).toEqual(
      [2, 3, 1, 4, 5].map((id) => ({
        jsonrpc: '2.0',
        id,
        result: { apiVersion: 'v1', serverVersion: 'stdio-test', capabilities: [] },
      })),
    );
    expect(responses().remainder.length).toBe(0);
    expect(stderr).toBe('');
  } finally {
    child.kill();
    await childExited;
    for (const peer of peers) peer.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
