import { createServer } from 'node:net';
import { defineConfig, devices } from '@playwright/test';

const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not determine a free port'));
        return;
      }
      probe.close(() => resolve(address.port));
    });
  });

// A fresh random port per run means this suite can never silently attach to an
// unrelated project's dev server on the same machine (Vite's default 5173 is
// shared by every local Vite project). `bun run dev` for manual use keeps the
// normal fixed port; only the automated e2e harness needs this.
// Playwright loads this config once per worker process; cache the chosen port in
// an env var (inherited by workers forked after this file first runs) so every
// process agrees on the same port the web server actually bound to.
const port = process.env.CANOPY_E2E_PORT
  ? Number(process.env.CANOPY_E2E_PORT)
  : await getFreePort();
// eslint-disable-next-line functional/immutable-data -- only way to share the chosen port with worker processes forked after this file loads
process.env.CANOPY_E2E_PORT = String(port);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // eslint-disable-next-line unicorn/no-useless-fallback-in-spread -- required to avoid explicit undefined under exactOptionalPropertyTypes
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `bun run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
