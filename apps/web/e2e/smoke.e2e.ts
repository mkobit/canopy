import { test, expect } from '@playwright/test';

test.describe('canopy smoke tests', () => {
  test('should create, use, and delete a graph', async ({ page }) => {
    // 1. Visit the homepage.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your Graphs' })).toBeVisible();

    // 2. Setup dialog handler for graph creation prompt.
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('E2E Test Graph');
      } else if (dialog.type() === 'confirm') {
        await dialog.accept();
      }
    });

    // 3. Click Create Graph button.
    await page.getByRole('button', { name: 'Create Graph' }).click();

    // 4. Confirm the new graph card is visible.
    const graphCard = page.locator('text=E2E Test Graph');
    await expect(graphCard).toBeVisible();

    // 5. Open the graph.
    await graphCard.click();

    // 6. Verify navigation to the graph page.
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+/);

    // 7. Click the New Node button in the side navbar.
    await page.getByRole('button', { name: 'New Node' }).click();

    // 8. Select the MarkdownNode type.
    await page.getByRole('dialog').locator('select').selectOption('system:nodetype:markdown');

    // 9. Fill out the content field.
    const contentInput = page.getByLabel('content *');
    await expect(contentInput).toBeVisible();
    await contentInput.fill('Hello from Playwright E2E test!');

    // 9. Submit the node creation.
    await page.getByRole('button', { name: 'Create' }).click();

    // 10. Verify navigation to the node detail page.
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/node\/[a-f0-9-]+/);

    // 11. Navigate back to the homepage.
    await page.getByRole('link', { name: 'Database' }).click();
    await expect(page).toHaveURL('/');

    // 12. Delete the graph.
    const card = page.locator('.group', { hasText: 'E2E Test Graph' });
    await card.hover();
    await card.getByRole('button').click();

    // 13. Confirm the graph card is gone.
    await expect(page.locator('text=E2E Test Graph')).toHaveCount(0);
  });
});
