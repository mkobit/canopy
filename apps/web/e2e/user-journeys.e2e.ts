import { expect, test } from '@playwright/test';

test.describe('User Journeys E2E', () => {
  test('navigates command palette and inspects seeded nodes', async ({ page }) => {
    await page.goto('/');

    // 1. Verify seeded demo graph is visible on the home page.
    const demoGraphCard = page.locator('text=Demo Graph');
    await expect(demoGraphCard).toBeVisible();

    // 2. Open the demo graph.
    await demoGraphCard.click();
    await expect(page).toHaveURL(/\/graph\/demo-graph/);

    // 3. Open command palette using Ctrl+P shortcut.
    await page.keyboard.press('Control+p');
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // 4. Verify search input inside command palette.
    const searchInput = dialog.locator('input[type="text"]');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', 'Search nodes...');

    // 5. Dismiss command palette using Escape key.
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('navigates graph views and schema via side navigation', async ({ page }) => {
    await page.goto('/graph/demo-graph');

    // 1. Verify canvas container is visible on graph page.
    await expect(page.locator('.h-full.flex.flex-col.w-full')).toBeVisible();

    // 2. Navigate to Schema section via side nav link.
    const schemaLink = page.getByRole('link', { name: 'Schema' });
    await expect(schemaLink).toBeVisible();
    await schemaLink.click();
    await expect(page).toHaveURL(/\/graph\/demo-graph\/schema/);

    // 3. Navigate back to Database / Home.
    const databaseLink = page.getByRole('link', { name: 'Database' });
    await expect(databaseLink).toBeVisible();
    await databaseLink.click();
    await expect(page).toHaveURL('/');
  });
});
