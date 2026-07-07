import { test, expect } from '@playwright/test';

test.describe('domain content types (canopy-goi)', () => {
  test('dogfoods the Schema UI to author Task/Project/Person and instantiate a Task', async ({
    page,
  }) => {
    // 1. Create a fresh graph and open it.
    await page.goto('/');
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('Domain Content Types E2E Graph');
      } else if (dialog.type() === 'confirm') {
        await dialog.accept();
      }
    });
    await page.getByRole('button', { name: 'Create Graph' }).click();
    const graphCard = page.locator('text=Domain Content Types E2E Graph');
    await expect(graphCard).toBeVisible();
    await graphCard.click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+/);

    // 2. Navigate to the Schema section and create the `content` namespace.
    await page.getByRole('link', { name: 'Schema' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema$/);
    await page.getByLabel('Name').fill('content');
    await page.getByLabel('Kind').selectOption('user');
    await page.getByRole('button', { name: 'Create namespace' }).click();
    // Scoped to the exact "content" heading rather than a substring match on the
    // whole card: bootstrap's default `user` ("Default namespace for
    // user-created content.") and `imported` ("Namespace for content imported
    // from external sources.") namespace descriptions both also contain the
    // substring "content", which made `hasText: 'content'` ambiguous (3 matches).
    const namespaceLink = page
      .locator('a')
      .filter({ has: page.getByRole('heading', { name: 'content', exact: true }) });
    await expect(namespaceLink).toBeVisible();

    // 3. Open the `content` namespace.
    await namespaceLink.click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema\/content$/);
    await expect(page.getByRole('heading', { name: 'content' })).toBeVisible();

    // 4. Create the shared `status` PropertyType.
    const propertyTypeForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'New PropertyType' }),
    });
    await propertyTypeForm.getByLabel('Name').fill('status');
    await propertyTypeForm.getByLabel('Value kind').selectOption('text');
    await propertyTypeForm.getByRole('button', { name: 'Create PropertyType' }).click();
    await expect(page.locator('li', { hasText: 'status' })).toBeVisible();

    // 5. Create the Person NodeType: name (required), email (optional).
    const nodeTypeForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'New NodeType' }),
    });
    let lastRow = nodeTypeForm.locator('div.border.rounded-md.bg-gray-50').last();

    await nodeTypeForm.getByLabel('Name').fill('Person');
    await nodeTypeForm.getByRole('button', { name: 'Inline property' }).click();
    lastRow = nodeTypeForm.locator('div.border.rounded-md.bg-gray-50').last();
    await lastRow.getByPlaceholder('Property name').fill('name');
    await lastRow.getByLabel('Required').check();

    await nodeTypeForm.getByRole('button', { name: 'Inline property' }).click();
    lastRow = nodeTypeForm.locator('div.border.rounded-md.bg-gray-50').last();
    await lastRow.getByPlaceholder('Property name').fill('email');

    await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
    const personItem = page.locator('li', { hasText: 'Person' });
    await expect(personItem).toBeVisible();
    await expect(personItem).toContainText('2 properties');

    // 6. Create the Project NodeType: name (required), description (optional),
    //    status (reference to the shared PropertyType).
    await nodeTypeForm.getByLabel('Name').fill('Project');
    await nodeTypeForm.getByRole('button', { name: 'Inline property' }).click();
    lastRow = nodeTypeForm.locator('div.border.rounded-md.bg-gray-50').last();
    await lastRow.getByPlaceholder('Property name').fill('name');
    await lastRow.getByLabel('Required').check();

    await nodeTypeForm.getByRole('button', { name: 'Inline property' }).click();
    lastRow = nodeTypeForm.locator('div.border.rounded-md.bg-gray-50').last();
    await lastRow.getByPlaceholder('Property name').fill('description');

    await nodeTypeForm.getByRole('button', { name: 'Reference PropertyType' }).click();
    await expect(
      nodeTypeForm.locator('option', { hasText: 'content/status (text)' }),
    ).toBeAttached();

    await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
    const projectItem = page.locator('li', { hasText: 'Project' });
    await expect(projectItem).toBeVisible();
    await expect(projectItem).toContainText('3 properties');

    // 7. Create the Task NodeType: title (required), priority (number),
    //    dueDate (plain-date), description (optional), status (reference).
    await nodeTypeForm.getByLabel('Name').fill('Task');
    await nodeTypeForm.getByRole('button', { name: 'Inline property' }).click();
    lastRow = nodeTypeForm.locator('div.border.rounded-md.bg-gray-50').last();
    await lastRow.getByPlaceholder('Property name').fill('title');
    await lastRow.getByLabel('Required').check();

    await nodeTypeForm.getByRole('button', { name: 'Inline property' }).click();
    lastRow = nodeTypeForm.locator('div.border.rounded-md.bg-gray-50').last();
    await lastRow.getByPlaceholder('Property name').fill('priority');
    await lastRow.locator('select').selectOption('number');

    await nodeTypeForm.getByRole('button', { name: 'Inline property' }).click();
    lastRow = nodeTypeForm.locator('div.border.rounded-md.bg-gray-50').last();
    await lastRow.getByPlaceholder('Property name').fill('dueDate');
    await lastRow.locator('select').selectOption('plain-date');

    await nodeTypeForm.getByRole('button', { name: 'Inline property' }).click();
    lastRow = nodeTypeForm.locator('div.border.rounded-md.bg-gray-50').last();
    await lastRow.getByPlaceholder('Property name').fill('description');

    await nodeTypeForm.getByRole('button', { name: 'Reference PropertyType' }).click();

    await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
    const taskItem = page.locator('li', { hasText: 'Task' });
    await expect(taskItem).toBeVisible();
    await expect(taskItem).toContainText('5 properties');
  });
});
