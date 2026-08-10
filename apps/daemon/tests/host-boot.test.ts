import * as fs from 'node:fs';
import { afterEach, describe, expect, it } from 'bun:test';
import { resolveDaemonConfig } from '../src/config';
import type { RunningHost } from '../src/host';
import { startHost } from '../src/host';
import { connect, getTemporarySocketPath, makeJsonRpcTestClient } from './test-support';

describe('daemon host boot', () => {
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

  it('starts in ephemeral mode and answers a handshake advertising the base capabilities', async () => {
    socketPath = getTemporarySocketPath('boot');
    const configResult = resolveDaemonConfig({ socketPath, ephemeral: true });
    expect(configResult.ok).toBe(true);
    if (!configResult.ok) return;

    const startResult = await startHost(configResult.value);
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) return;
    host = startResult.value;

    expect(host.getSocketPath()).toBe(socketPath);

    const socket = await connect(socketPath);
    const client = makeJsonRpcTestClient(socket);
    const response = await client.send('canopy.v1.handshake', { clientVersion: '0.1.0' });

    expect(response.error).toBeUndefined();
    const capabilities = response.result?.capabilities as readonly string[] | undefined;
    expect(capabilities).toBeDefined();
    // The `drafts` capability is added by the sibling canopy-h7z.2 change; only
    // assert on the capabilities this change is responsible for.
    expect(capabilities).toContain('queries');
    expect(capabilities).toContain('mutations');
    expect(capabilities).toContain('subscriptions');

    socket.destroy();
  });
});
