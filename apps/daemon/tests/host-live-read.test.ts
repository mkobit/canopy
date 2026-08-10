import * as fs from 'node:fs';
import { afterEach, describe, expect, it } from 'bun:test';
import { resolveDaemonConfig } from '../src/config';
import type { RunningHost } from '../src/host';
import { startHost } from '../src/host';
import { connect, getTemporarySocketPath, makeJsonRpcTestClient } from './test-support';

describe('daemon host live reads', () => {
  let host: RunningHost | undefined;
  let socketPath: string;

  afterEach(async () => {
    if (host) {
      await host.close();
      host = undefined;
    }
    if (socketPath && fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });

  it('sees a mutation committed through the socket on a subsequent query on the same host', async () => {
    socketPath = getTemporarySocketPath('live-read');
    const configResult = resolveDaemonConfig({ socketPath, ephemeral: true });
    expect(configResult.ok).toBe(true);
    if (!configResult.ok) return;

    const startResult = await startHost(configResult.value);
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) return;
    host = startResult.value;

    const socket = await connect(socketPath);
    const client = makeJsonRpcTestClient(socket);

    const created = await client.send('canopy.v1.mutation.createNode', {
      id: 'node_live_read_test',
      type: 'concept',
      properties: { title: 'Live read proof' },
    });
    expect(created.error).toBeUndefined();
    expect((created.result?.id as string | undefined) ?? '').toBe('node_live_read_test');

    // This only proves a *loaded, live* session -- not a stale graph snapshot
    // -- because the context was built once at boot (see host.ts) and this
    // read happens over the same connection/process without a restart.
    const fetched = await client.send('canopy.v1.query.getNode', { id: 'node_live_read_test' });
    expect(fetched.error).toBeUndefined();
    expect(fetched.result?.id).toBe('node_live_read_test');
    expect(
      (fetched.result?.properties as Readonly<Record<string, unknown>> | undefined)?.title,
    ).toBe('Live read proof');

    socket.destroy();
  });
});
