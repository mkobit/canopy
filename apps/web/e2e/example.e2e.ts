import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  // Wait for React to mount and render something basic
  await expect(page).toHaveTitle(/Canopy|Vite/i);
});
