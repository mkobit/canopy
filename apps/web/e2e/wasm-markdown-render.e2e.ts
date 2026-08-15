import { test, expect } from '@playwright/test';

// Proves the first-party Markdown renderer runs as a real WASM plugin in a real
// browser: the StarlingMonkey/WASI component instantiates, executes through
// `executeSandboxedGuestPlugin`, and its output renders via the Tier-1
// sanitized-inline path (DOMPurify + closed shadow DOM). This is the end-to-end
// evidence Bun unit tests cannot provide (they import `guest.js` directly).
test.describe('WASM Markdown rendering', () => {
  test('instantiates the plugin in-browser and renders sanitized output', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('WASM Render E2E');
      } else {
        await dialog.accept();
      }
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your Graphs' })).toBeVisible();
    await page.getByRole('button', { name: 'Create Graph' }).click();

    const graphCard = page.locator('text=WASM Render E2E');
    await expect(graphCard).toBeVisible();
    await graphCard.click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+/);

    // Create a Markdown node whose content includes a heading and a hostile
    // <script> the sanitizer must strip.
    await page.getByRole('button', { name: 'New Node' }).click();
    await page.getByRole('dialog').locator('select').selectOption('system:nodetype:markdown');
    const contentInput = page.getByLabel('content *');
    await expect(contentInput).toBeVisible();
    await contentInput.fill(
      '# WASM Heading\n\n<script>window.__pwned = true;</script>ordinary text',
    );
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/node\/[a-f0-9-]+/);

    // 1. The WASM render pipeline resolves to `ok` — proves the component
    //    instantiated in the browser, executed, and returned a valid envelope.
    //    (A resolution/instantiation failure would stay on the native fallback.)
    const block = page.getByTestId('wasm-rendered-block');
    await expect(block).toHaveAttribute('data-render-status', 'ok', { timeout: 30_000 });

    // 2. The output mounts in a CLOSED shadow root: the host element exists but
    //    its `.shadowRoot` is null (closed roots are not exposed), so the
    //    rendered HTML is not reachable from the page's light DOM.
    const closed = await block.evaluate((element) => {
      const host = element.firstElementChild;
      return host instanceof HTMLElement && host.shadowRoot === null;
    });
    expect(closed).toBe(true);

    // 3. The hostile script never executed (DOMPurify stripped it; innerHTML
    //    never runs <script>).
    const pwned = await page.evaluate(() => '__pwned' in globalThis);
    expect(pwned).toBe(false);
  });
});
