# Domain namespace split implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the domain content types into isolated `tasks` and `contacts` namespaces and update the E2E test to verify compatibility.

**Architecture:** Refactor the Playwright E2E test `apps/web/e2e/domain-content-types.e2e.ts` to create both `tasks` and `contacts` namespaces, author respective types, use loose cross-namespace references (unchecked target types for `tasks:assigned_to` to ensure independence), and verify instantiation of a `tasks:Task` node.

**Tech Stack:** Playwright, Bun, Vite

---

### Task 1: Refactor the E2E test to use split domain namespaces

**Files:**

- Modify: `apps/web/e2e/domain-content-types.e2e.ts`

- [ ] **Step 1: Write the updated test code**

  Replace the entire content of `apps/web/e2e/domain-content-types.e2e.ts` with the following implementation.

  ```typescript
  import { test, expect, type Locator, type Page } from '@playwright/test';

  async function createAndOpenGraph(page: Page): Promise<void> {
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
  }

  async function createNamespacesAndStatusPropertyType(page: Page): Promise<void> {
    // 2. Navigate to the Schema section and create the `tasks` and `contacts` namespaces.
    await page.getByRole('link', { name: 'Schema' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema$/);

    // Create the tasks namespace
    await page.getByLabel('Name').fill('tasks');
    await page.getByLabel('Kind').selectOption('user');
    await page.getByRole('button', { name: 'Create namespace' }).click();

    const tasksLink = page
      .locator('a')
      .filter({ has: page.getByRole('heading', { name: 'tasks', exact: true }) });
    await expect(tasksLink).toBeVisible();

    // Create the contacts namespace
    await page.getByLabel('Name').fill('contacts');
    await page.getByLabel('Kind').selectOption('user');
    await page.getByRole('button', { name: 'Create namespace' }).click();

    const contactsLink = page
      .locator('a')
      .filter({ has: page.getByRole('heading', { name: 'contacts', exact: true }) });
    await expect(contactsLink).toBeVisible();

    // 3. Open the `tasks` namespace.
    await tasksLink.click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema\/tasks$/);
    await expect(page.getByRole('heading', { name: 'tasks' })).toBeVisible();

    // 4. Create the shared `status` PropertyType.
    const propertyTypeForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'New PropertyType' }),
    });
    await propertyTypeForm.getByLabel('Name').fill('status');
    await propertyTypeForm.getByLabel('Value kind').selectOption('text');
    await propertyTypeForm.getByRole('button', { name: 'Create PropertyType' }).click();
    await expect(page.locator('li', { hasText: 'status' })).toBeVisible();
  }

  interface InlinePropertyOptions {
    readonly required?: boolean;
    readonly valueKind?: string;
  }

  async function addInlineProperty(
    form: Locator,
    name: string,
    options: InlinePropertyOptions = {},
  ): Promise<void> {
    await form.getByRole('button', { name: 'Inline property' }).click();
    const row = form.locator('div.border.rounded-md.bg-gray-50').last();
    await row.getByPlaceholder('Property name').fill(name);
    if (options.required) {
      await row.getByLabel('Required').check();
    }
    if (options.valueKind) {
      await row.locator('select').selectOption(options.valueKind);
    }
  }

  async function createNodeTypes(page: Page): Promise<void> {
    // 5. Create the Project and Task NodeTypes inside the tasks namespace.
    const nodeTypeForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'New NodeType' }),
    });

    await nodeTypeForm.getByLabel('Name').fill('Project');
    await addInlineProperty(nodeTypeForm, 'name', { required: true });
    await addInlineProperty(nodeTypeForm, 'description');
    await nodeTypeForm.getByRole('button', { name: 'Reference PropertyType' }).click();
    await expect(nodeTypeForm.locator('option', { hasText: 'tasks/status (text)' })).toBeAttached();
    await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
    const projectItem = page.locator('li', { hasText: 'Project' });
    await expect(projectItem).toBeVisible();
    await expect(projectItem).toContainText('3 properties');

    await nodeTypeForm.getByLabel('Name').fill('Task');
    await addInlineProperty(nodeTypeForm, 'title', { required: true });
    await addInlineProperty(nodeTypeForm, 'priority', { valueKind: 'number' });
    await addInlineProperty(nodeTypeForm, 'dueDate', { valueKind: 'plain-date' });
    await addInlineProperty(nodeTypeForm, 'description');
    await nodeTypeForm.getByRole('button', { name: 'Reference PropertyType' }).click();
    await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
    const taskItem = page.locator('li', { hasText: 'Task' });
    await expect(taskItem).toBeVisible();
    await expect(taskItem).toContainText('5 properties');

    // 6. Navigate to contacts namespace and create Person NodeType.
    await page.getByRole('link', { name: 'Schema' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema$/);
    await page
      .locator('a')
      .filter({ has: page.getByRole('heading', { name: 'contacts', exact: true }) })
      .click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema\/contacts$/);

    await nodeTypeForm.getByLabel('Name').fill('Person');
    await addInlineProperty(nodeTypeForm, 'name', { required: true });
    await addInlineProperty(nodeTypeForm, 'email');
    await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
    const personItem = page.locator('li', { hasText: 'Person' });
    await expect(personItem).toBeVisible();
    await expect(personItem).toContainText('2 properties');
  }

  async function createEdgeTypes(page: Page): Promise<void> {
    // 7. Navigate back to tasks namespace to create EdgeTypes.
    await page.getByRole('link', { name: 'Schema' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema$/);
    await page
      .locator('a')
      .filter({ has: page.getByRole('heading', { name: 'tasks', exact: true }) })
      .click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema\/tasks$/);

    const edgeTypeForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'New EdgeType' }),
    });
    const sourceTypesBox = edgeTypeForm.locator('div.max-h-32').first();
    const targetTypesBox = edgeTypeForm.locator('div.max-h-32').nth(1);

    // 8. Create the belongs_to EdgeType: tasks/Task -> tasks/Project.
    await edgeTypeForm.getByLabel('Name', { exact: true }).fill('belongs_to');
    await sourceTypesBox.getByLabel('tasks/Task').check();
    await targetTypesBox.getByLabel('tasks/Project').check();
    await edgeTypeForm.getByRole('button', { name: 'Create EdgeType' }).click();
    const belongsToItem = page.locator('li', { hasText: 'belongs_to' });
    await expect(belongsToItem).toBeVisible();
    await expect(belongsToItem.locator('p.font-mono')).not.toContainText('any -> any');

    // 9. Create the assigned_to EdgeType: tasks/Task -> any (loose coupling).
    // Leave target types unchecked to maintain domain boundary independence.
    await edgeTypeForm.getByLabel('Name', { exact: true }).fill('assigned_to');
    await sourceTypesBox.getByLabel('tasks/Task').check();
    await edgeTypeForm.getByRole('button', { name: 'Create EdgeType' }).click();
    const assignedToItem = page.locator('li', { hasText: 'assigned_to' });
    await expect(assignedToItem).toBeVisible();
  }

  async function instantiateTaskNode(page: Page): Promise<void> {
    // 10. Instantiate a real Task node via the New Node dialog.
    await page.getByRole('button', { name: 'New Node' }).click();
    const newNodeDialog = page.getByRole('dialog');
    await newNodeDialog.locator('select').selectOption({ label: 'Task' });
    await newNodeDialog.getByLabel('title *').fill('Write the domain content types e2e test');
    await expect(newNodeDialog.getByLabel('status')).toBeVisible();
    await expect(newNodeDialog.getByLabel('priority')).toBeVisible();
    await expect(newNodeDialog.getByLabel('dueDate')).toBeVisible();
    await expect(newNodeDialog.getByLabel('description')).toBeVisible();
    await newNodeDialog.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/node\/[a-f0-9-]+/);
  }

  async function cleanUpGraph(page: Page): Promise<void> {
    // 11. Clean up: delete the test graph.
    await page.getByRole('link', { name: 'Database' }).click();
    await expect(page).toHaveURL('/');
    const card = page.locator('.group', { hasText: 'Domain Content Types E2E Graph' });
    await card.hover();
    await card.getByRole('button').click();
    await expect(page.locator('text=Domain Content Types E2E Graph')).toHaveCount(0);
  }

  test.describe('domain content types (canopy-goi)', () => {
    test('dogfoods the Schema UI to author Task/Project/Person and instantiate a Task', async ({
      page,
    }) => {
      await createAndOpenGraph(page);
      await createNamespacesAndStatusPropertyType(page);
      await createNodeTypes(page);
      await createEdgeTypes(page);
      await instantiateTaskNode(page);
      await cleanUpGraph(page);
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it passes**

  Run: `bun --filter @canopy/web test:e2e`
  Expected: PASS

- [ ] **Step 3: Commit the changes**

  ```bash
  git add apps/web/e2e/domain-content-types.e2e.ts
  git commit -m "test: update domain content types test to use split namespaces"
  ```
