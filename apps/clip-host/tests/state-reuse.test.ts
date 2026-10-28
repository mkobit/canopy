import { expect, it } from 'bun:test';
import type { IpcClient } from '@canopy/api-adapter';
import { Effect } from 'effect';
import { createClipHost, CLIP_HOST_ERROR_CODES } from '../src/host';

const handshake = { apiVersion: 'v1' as const, serverVersion: 'test', capabilities: [] };
const request = { method: 'canopy.v1.handshake', id: 1 };
const createRequest = {
  method: 'canopy.v1.mutation.createNode',
  params: { type: 'clip-type', properties: {} },
  id: 2,
};
const nodes = [
  {
    id: 'clip-type',
    type: 'node:type:node-type',
    properties: { name: 'WebClip', namespace: 'clip' },
    createdAt: '',
    updatedAt: '',
  },
];

it('Successful reuse and failure retry includes typed connection errors and defects', async () => {
  for (const failure of [
    Effect.fail({ _tag: 'IpcClientError' as const, code: -32_603, message: 'offline' }),
    Effect.die('offline'),
  ]) {
    let connects = 0;
    const client = { handshake: () => Effect.succeed(handshake) } as unknown as IpcClient;
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: { tryAcquire: () => true },
      connect: () => (++connects === 1 ? failure : Effect.succeed(client)),
    });
    const response1 = await host.handleRequest(request);
    expect(response1.error?.code).toBe(CLIP_HOST_ERROR_CODES.DAEMON_UNAVAILABLE);
    const response2 = await host.handleRequest(request);
    expect(response2.result).toEqual(handshake);
    const response3 = await host.handleRequest(request);
    expect(response3.result).toEqual(handshake);
    expect(connects).toBe(2);
  }
});

it('Failed type lookup retries, successful type and connection state are reused after dispatch failure', async () => {
  let connects = 0;
  let lookups = 0;
  let creates = 0;
  const client = {
    getNodes: () =>
      ++lookups === 1
        ? Effect.fail({ _tag: 'IpcClientError', code: -32_603, message: 'lookup failed' })
        : Effect.succeed(nodes),
    createNode: () =>
      ++creates === 1
        ? Effect.fail({
            _tag: 'IpcClientError',
            code: -32_000,
            message: 'dispatch failed',
            details: { retry: true },
          })
        : Effect.succeed({ id: 'clip' }),
  } as unknown as IpcClient;
  const host = createClipHost({
    socketPath: '/unused',
    rateLimiter: { tryAcquire: () => true },
    connect: () => {
      connects++;
      return Effect.succeed(client);
    },
  });
  const response4 = await host.handleRequest(createRequest);
  expect(response4.error?.code).toBe(CLIP_HOST_ERROR_CODES.DAEMON_UNAVAILABLE);
  const response5 = await host.handleRequest(createRequest);
  expect(response5.error).toEqual({
    code: -32_000,
    message: 'dispatch failed',
    data: { retry: true },
  });
  const response6 = await host.handleRequest(createRequest);
  expect(response6.result).toEqual({ id: 'clip' });
  expect([connects, lookups, creates]).toEqual([1, 2, 2]);
});

it('Concurrent cold requests start both connection and type lookups without deduplication', async () => {
  const connects: ((client: IpcClient) => void)[] = [];
  const lookups: (() => void)[] = [];
  const client = {
    getNodes: () =>
      Effect.promise(
        () =>
          new Promise((resolve) => {
            lookups.push(() => resolve(nodes));
          }),
      ),
    createNode: () => Effect.succeed({ id: 'clip' }),
  } as unknown as IpcClient;
  const host = createClipHost({
    socketPath: '/unused',
    rateLimiter: { tryAcquire: () => true },
    connect: () =>
      Effect.promise(
        () =>
          new Promise((resolve) => {
            connects.push(resolve);
          }),
      ),
  });
  const first = host.handleRequest(createRequest);
  const second = host.handleRequest(createRequest);
  expect(connects.length).toBe(2);
  for (const resolve of connects) resolve(client);
  await Bun.sleep(0);
  expect(lookups.length).toBe(2);
  for (const resolve of lookups) resolve();
  const responses = await Promise.all([first, second]);
  expect(responses.every((response) => !response.error)).toBe(true);
});

it('Denied methods precede rate acquisition; rate rejection precedes connection', async () => {
  let rates = 0;
  let connects = 0;
  const host = createClipHost({
    socketPath: '/unused',
    rateLimiter: {
      tryAcquire: () => {
        rates++;
        return false;
      },
    },
    connect: () => {
      connects++;
      return Effect.die('unexpected connection');
    },
  });
  const response7 = await host.handleRequest({ method: 'denied' });
  expect(response7.error?.code).toBe(CLIP_HOST_ERROR_CODES.METHOD_NOT_ALLOWED);
  expect([rates, connects]).toEqual([0, 0]);
  const response8 = await host.handleRequest(request);
  expect(response8.error?.code).toBe(CLIP_HOST_ERROR_CODES.RATE_LIMITED);
  expect([rates, connects]).toEqual([1, 0]);
});
