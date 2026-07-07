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

    // 8. Create the belongs_to EdgeType: Task -> Project.
    const edgeTypeForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'New EdgeType' }),
    });
    const sourceTypesBox = edgeTypeForm.locator('div.max-h-32').first();
    const targetTypesBox = edgeTypeForm.locator('div.max-h-32').nth(1);

    await edgeTypeForm.getByLabel('Name', { exact: true }).fill('belongs_to');
    await sourceTypesBox.getByLabel('content/Task').check();
    await targetTypesBox.getByLabel('content/Project').check();
    await edgeTypeForm.getByRole('button', { name: 'Create EdgeType' }).click();
    const belongsToItem = page.locator('li', { hasText: 'belongs_to' });
    await expect(belongsToItem).toBeVisible();
    // sourceTypes/targetTypes render as raw NodeIds (see EdgeTypeList in
    // schema-namespace-page.tsx), not "namespace/Name" strings, and those IDs are
    // freshly generated so can't be predicted here -- just confirm the
    // source/target line isn't the unrestricted "any -> any" default.
    await expect(belongsToItem.locator('p.font-mono')).not.toContainText('any -> any');

    // 9. Create the assigned_to EdgeType: Task -> Person.
    await edgeTypeForm.getByLabel('Name', { exact: true }).fill('assigned_to');
    await sourceTypesBox.getByLabel('content/Task').check();
    await targetTypesBox.getByLabel('content/Person').check();
    await edgeTypeForm.getByRole('button', { name: 'Create EdgeType' }).click();
    const assignedToItem = page.locator('li', { hasText: 'assigned_to' });
    await expect(assignedToItem).toBeVisible();
    await expect(assignedToItem.locator('p.font-mono')).not.toContainText('any -> any');

    // 10. Instantiate a real Task node via the New Node dialog -- proves the
    //     type is usable, not just definable (also exercises the Task 1 fix).
    // Scoped to the <dialog> element itself: the underlying `<label><span>Type</span>
    // <select>...` markup makes the select's computed accessible name include every
    // option's text ("TypeTextBlockCodeBlockMarkdownNodePersonProjectTask"), and an
    // unscoped `getByLabel('Type')` substring-matches the still-mounted EdgeType
    // form's "system/Node Type" etc. checkboxes behind the dialog -- 7-way strict
    // mode violation without this scope.
    await page.getByRole('button', { name: 'New Node' }).click();
    const newNodeDialog = page.getByRole('dialog');
    await newNodeDialog.getByLabel('Type').selectOption({ label: 'Task' });
    await newNodeDialog.getByLabel('title *').fill('Write the domain content types e2e test');
    await expect(newNodeDialog.getByLabel('status')).toBeVisible();
    await expect(newNodeDialog.getByLabel('priority')).toBeVisible();
    await expect(newNodeDialog.getByLabel('dueDate')).toBeVisible();
    await expect(newNodeDialog.getByLabel('description')).toBeVisible();
    await newNodeDialog.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/node\/[a-f0-9-]+/);

    // 11. Clean up: delete the test graph.
    await page.getByRole('link', { name: 'Database' }).click();
    await expect(page).toHaveURL('/');
    const card = page.locator('.group', { hasText: 'Domain Content Types E2E Graph' });
    await card.hover();
    await card.getByRole('button').click();
    await expect(page.locator('text=Domain Content Types E2E Graph')).toHaveCount(0);
  });
});
