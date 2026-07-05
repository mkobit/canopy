import { test, expect } from '@playwright/test';

test.describe('event-sourced block editing', () => {
  test('editing a node’s content commits through the event log and survives reload', async ({
    page,
  }) => {
    // 1. Create a fresh graph and open it.
    await page.goto('/');
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('E2E Content Test Graph');
      } else if (dialog.type() === 'confirm') {
        await dialog.accept();
      }
    });
    await page.getByRole('button', { name: 'Create Graph' }).click();
    const graphCard = page.locator('text=E2E Content Test Graph');
    await expect(graphCard).toBeVisible();
    await graphCard.click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+/);

    // 2. Create a MarkdownNode with initial content.
    await page.getByRole('button', { name: 'New Node' }).click();
    await page.getByLabel('Type').selectOption('system:nodetype:markdown');
    await page.getByLabel('content *').fill('initial content');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/node\/[a-f0-9-]+/);

    // 3. Enter edit mode and edit the block content via the rich-text editor.
    await page.getByRole('button', { name: 'Edit' }).click();
    const editor = page.locator('[contenteditable="true"]');
    await editor.click();
    await editor.fill('updated content via e2e');
    // Blur flushes the pending edit immediately (no need to wait out the idle debounce).
    await page.getByRole('button', { name: 'Cancel' }).click();

    // 4. Reload the page — the graph reloads by replaying the event log from IndexedDB.
    await page.reload();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/node\/[a-f0-9-]+/);
    await expect(
      page.getByRole('paragraph').filter({ hasText: 'updated content via e2e' }),
    ).toBeVisible();

    // 5. Clean up: delete the test graph.
    await page.getByRole('link', { name: 'Database' }).click();
    await expect(page).toHaveURL('/');
    const card = page.locator('.group', { hasText: 'E2E Content Test Graph' });
    await card.hover();
    await card.getByRole('button').click();
    await expect(page.locator('text=E2E Content Test Graph')).toHaveCount(0);
  });
});
