import { test, expect } from '@playwright/test';

test.describe('schema authoring', () => {
  test('creates a namespace, NodeType, and PropertyType, references it, and blocks restricted-namespace writes', async ({
    page,
  }) => {
    // 1. Create a fresh graph and open it.
    await page.goto('/');
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('E2E Schema Test Graph');
      } else if (dialog.type() === 'confirm') {
        await dialog.accept();
      }
    });
    await page.getByRole('button', { name: 'Create Graph' }).click();
    const graphCard = page.locator('text=E2E Schema Test Graph');
    await expect(graphCard).toBeVisible();
    await graphCard.click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+/);

    // 2. Navigate to the Schema section.
    await page.getByRole('link', { name: 'Schema' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema$/);
    await expect(page.getByRole('heading', { name: 'Schema' })).toBeVisible();
    await expect(page.locator('a', { hasText: 'system' })).toBeVisible();

    // 3. Create a namespace with a custom kind.
    await page.getByLabel('Name').fill('e2e-schema');
    await page.getByLabel('Kind').selectOption({ label: 'Custom…' });
    await page.getByPlaceholder('kind value').fill('e2e-kind');
    await page.getByRole('button', { name: 'Create namespace' }).click();
    const namespaceLink = page.locator('a').filter({ hasText: 'e2e-schema' });
    await expect(namespaceLink).toBeVisible();

    // 4. Open the new namespace.
    await namespaceLink.click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema\/e2e-schema$/);
    await expect(page.getByRole('heading', { name: 'e2e-schema' })).toBeVisible();

    // 5. Create a NodeType with no properties yet.
    const nodeTypeForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'New NodeType' }),
    });
    await nodeTypeForm.getByLabel('Name').fill('Task');
    await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
    await expect(page.locator('li', { hasText: 'Task' })).toBeVisible();

    // 6. Create a PropertyType.
    const propertyTypeForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'New PropertyType' }),
    });
    await propertyTypeForm.getByLabel('Name').fill('priority');
    await propertyTypeForm.getByLabel('Value kind').selectOption('number');
    await propertyTypeForm.getByRole('button', { name: 'Create PropertyType' }).click();
    await expect(page.locator('li', { hasText: 'priority' })).toBeVisible();

    // 7. Create a second NodeType that references the new PropertyType.
    await nodeTypeForm.getByLabel('Name').fill('Project');
    await nodeTypeForm.getByRole('button', { name: 'Reference PropertyType' }).click();
    await expect(
      nodeTypeForm.locator('option', { hasText: 'e2e-schema/priority (number)' }),
    ).toBeAttached();
    await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
    const projectItem = page.locator('li', { hasText: 'Project' });
    await expect(projectItem).toBeVisible();
    await expect(projectItem).toContainText('1 property');

    // 8. Navigate to the restricted `system` namespace and confirm writes are blocked.
    await page.getByRole('button', { name: 'Namespaces' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema$/);
    await page.locator('a', { hasText: 'system' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema\/system$/);
    await expect(page.getByText("new definitions can't be created here")).toBeVisible();

    const restrictedNodeTypeForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'New NodeType' }),
    });
    await restrictedNodeTypeForm.getByLabel('Name').fill('ShouldNotExist');
    await restrictedNodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
    await expect(restrictedNodeTypeForm.getByText(/restricted/i)).toBeVisible();
    await expect(page.locator('li', { hasText: 'ShouldNotExist' })).toHaveCount(0);

    // 9. Clean up: delete the test graph.
    await page.getByRole('link', { name: 'Database' }).click();
    await expect(page).toHaveURL('/');
    const card = page.locator('.group', { hasText: 'E2E Schema Test Graph' });
    await card.hover();
    await card.getByRole('button').click();
    await expect(page.locator('text=E2E Schema Test Graph')).toHaveCount(0);
  });
});
