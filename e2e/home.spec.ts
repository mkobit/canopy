import { test, expect } from '@playwright/test';

test('homepage loads and shows Your Graphs', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Your Graphs')).toBeVisible();
});
