import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const fixturePath = '/e2e/fixtures/renderer-unavailable/index.html';

const fixtureUrl = (fixtureCase: string): string =>
  `${fixturePath}?case=${encodeURIComponent(fixtureCase)}&node=${encodeURIComponent(randomUUID())}`;

const captureRendererRequests = (page: Page): string[] => {
  const requests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/plugin/runtime/render-worker.ts') || url.includes('markdown-render-plugin'))
      requests.push(url);
  });
  return requests;
};

const expectNoStaticGuestRequest = (requests: readonly string[]): void => {
  expect(requests.some((url) => url.includes('markdown-render-plugin'))).toBe(false);
};

const expectUnavailable = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('renderer-unavailable')).toHaveText(
    'Interactive renderer unavailable',
  );
  await expect(page.getByTestId('tier2-frame')).toHaveCount(0);
  await expect(page.getByTestId('wasm-rendered-block')).toHaveCount(0);
  await expect(page.getByTestId('tier2-static-preview')).toHaveCount(0);
};

test.describe('interactive renderer unavailable behavior', () => {
  test('fails closed for a missing guest id', async ({ page }) => {
    const requests = captureRendererRequests(page);
    await page.goto(fixtureUrl('missing'));
    await expectUnavailable(page);
    expect(requests.some((url) => url.includes('/plugin/runtime/render-worker.ts'))).toBe(false);
    expectNoStaticGuestRequest(requests);
  });

  test('fails closed for an empty guest id', async ({ page }) => {
    const requests = captureRendererRequests(page);
    await page.goto(fixtureUrl('empty'));
    await expectUnavailable(page);
    expect(requests.some((url) => url.includes('/plugin/runtime/render-worker.ts'))).toBe(false);
    expectNoStaticGuestRequest(requests);
  });

  test('fails closed for an unknown registered guest id', async ({ page }) => {
    const requests = captureRendererRequests(page);
    await page.goto(fixtureUrl('unknown'));
    await expectUnavailable(page);
    expect(requests.some((url) => url.includes('/plugin/runtime/render-worker.ts'))).toBe(true);
    expectNoStaticGuestRequest(requests);
  });

  test('fails closed when the actual render worker module request aborts', async ({ page }) => {
    const requests = captureRendererRequests(page);
    const failedRequests: string[] = [];
    page.on('requestfailed', (request) => {
      if (request.url().includes('/plugin/runtime/render-worker.ts'))
        failedRequests.push(request.url());
    });
    await page.route('**/render-worker.ts*', (route) => route.abort('failed'));
    await page.goto(fixtureUrl('worker-load'));
    await expectUnavailable(page);
    expect(failedRequests.length).toBeGreaterThan(0);
    expectNoStaticGuestRequest(requests);
  });

  test('an additional raw grant does not downgrade an unavailable interactive renderer', async ({
    page,
  }) => {
    const requests = captureRendererRequests(page);
    await page.goto(fixtureUrl('raw-interactive-missing'));
    await expectUnavailable(page);
    expect(requests.some((url) => url.includes('/plugin/runtime/render-worker.ts'))).toBe(false);
    expectNoStaticGuestRequest(requests);
  });

  test('keeps a raw-only renderer on Tier 1', async ({ page }) => {
    await page.goto(fixtureUrl('raw-only'));
    const block = page.getByTestId('wasm-rendered-block');
    await expect(block).toHaveAttribute('data-render-status', 'ok', { timeout: 30_000 });
    await expect(page.getByTestId('tier2-rendered-block')).toHaveCount(0);
    await expect(page.getByTestId('tier2-frame')).toHaveCount(0);
  });

  test('does not convey interactive authority from a wildcard grant', async ({ page }) => {
    await page.goto(fixtureUrl('wildcard'));
    const block = page.getByTestId('wasm-rendered-block');
    await expect(block).toHaveAttribute('data-render-status', 'error', { timeout: 30_000 });
    await expect(page.getByTestId('tier2-rendered-block')).toHaveCount(0);
    await expect(page.getByTestId('tier2-frame')).toHaveCount(0);
  });

  test('renders an available interactive guest in the real Tier-2 frame', async ({ page }) => {
    const requests = captureRendererRequests(page);
    await page.goto(fixtureUrl('valid'));
    const block = page.getByTestId('tier2-rendered-block');
    await expect(block).toHaveAttribute('data-render-status', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('tier2-frame')).toHaveCount(1);
    await expect(page.getByTestId('tier2-frame')).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(page.getByTestId('tier2-frame')).toHaveAttribute(
      'srcdoc',
      /data-fixture="interactive"/,
    );
    await expect(page.getByTestId('tier2-static-preview')).toHaveCount(0);
    expect(requests.some((url) => url.includes('/plugin/runtime/render-worker.ts'))).toBe(true);
    expect(await page.evaluate(() => '__pwned' in globalThis)).toBe(false);
  });
});
