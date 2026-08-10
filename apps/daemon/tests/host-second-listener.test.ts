import * as fs from 'node:fs';
import { afterEach, describe, expect, it } from 'bun:test';
import { resolveDaemonConfig } from '../src/config';
import type { RunningHost } from '../src/host';
import { startHost } from '../src/host';
import { getTemporarySocketPath } from './test-support';

describe('daemon host second-listener rejection', () => {
  let firstHost: RunningHost | undefined;
  let secondHost: RunningHost | undefined;
  let socketPath: string;

  afterEach(async () => {
    if (secondHost) {
      await secondHost.close();
      secondHost = undefined;
    }
    if (firstHost) {
      await firstHost.close();
      firstHost = undefined;
    }
    if (socketPath && fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });

  it('fails fast with IpcSocketInUseError and does not bind a second listener on the same socket path', async () => {
    socketPath = getTemporarySocketPath('second-listener');
    const configResult = resolveDaemonConfig({ socketPath, ephemeral: true });
    expect(configResult.ok).toBe(true);
    if (!configResult.ok) return;

    const firstResult = await startHost(configResult.value);
    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) return;
    firstHost = firstResult.value;

    expect(firstHost.getActiveConnectionCount()).toBe(0);

    const secondResult = await startHost(configResult.value);
    expect(secondResult.ok).toBe(false);
    if (secondResult.ok) return;
    expect(secondResult.error._tag).toBe('IpcSocketInUseError');

    // The rejected second attempt must not have bound a listener -- the
    // first host's socket is still the only one live.
    expect(fs.existsSync(socketPath)).toBe(true);
  });
});
