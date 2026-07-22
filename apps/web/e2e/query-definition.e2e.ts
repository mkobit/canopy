import { test, expect, type Locator, type Page } from '@playwright/test';

async function createAndOpenGraph(page: Page): Promise<void> {
  // 1. Create a fresh graph and open it.
  await page.goto('/');
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') {
      await dialog.accept('Query Definition E2E Graph');
    } else if (dialog.type() === 'confirm') {
      await dialog.accept();
    }
  });
  await page.getByRole('button', { name: 'Create Graph' }).click();
  const graphCard = page.locator('text=Query Definition E2E Graph');
  await expect(graphCard).toBeVisible();
  await graphCard.click();
  await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+/);
}

async function createCadenceNamespace(page: Page): Promise<void> {
  // 2. Navigate to the Schema section and create the `cadence` namespace.
  await page.getByRole('link', { name: 'Schema' }).click();
  await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema$/);
  await page.getByLabel('Name').fill('cadence');
  await page.getByLabel('Kind').selectOption('user');
  await page.getByRole('button', { name: 'Create namespace' }).click();
  const namespaceLink = page
    .locator('a')
    .filter({ has: page.getByRole('heading', { name: 'cadence', exact: true }) });
  await expect(namespaceLink).toBeVisible();

  // 3. Open the `cadence` namespace.
  await namespaceLink.click();
  await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/schema\/cadence$/);
  await expect(page.getByRole('heading', { name: 'cadence' })).toBeVisible();
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

async function createCadenceActionNodeType(page: Page): Promise<void> {
  const nodeTypeForm = page.locator('form', {
    has: page.getByRole('heading', { name: 'New NodeType' }),
  });

  // 4. Create the CadenceAction NodeType: actionKind (required, text),
  //    target (optional, reference), description (optional, text).
  await nodeTypeForm.getByLabel('Name').fill('CadenceAction');
  await addInlineProperty(nodeTypeForm, 'actionKind', { required: true });
  await addInlineProperty(nodeTypeForm, 'target', { valueKind: 'reference' });
  await addInlineProperty(nodeTypeForm, 'description');
  await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
  const cadenceActionItem = page.locator('li', { hasText: 'CadenceAction' });
  await expect(cadenceActionItem).toBeVisible();
  await expect(cadenceActionItem).toContainText('3 properties');
}

async function instantiateNodes(page: Page): Promise<void> {
  // 5. Instantiate a real Query Definition node.
  await page.getByRole('button', { name: 'New Node' }).click();
  const newQueryDialog = page.getByRole('dialog');
  await newQueryDialog.locator('select').selectOption({ label: 'Query Definition' });
  await newQueryDialog.getByLabel('name *').fill('All Nodes Query');
  await newQueryDialog.getByLabel('definition *').fill('{"type":"all-nodes"}');
  await newQueryDialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/node\/[a-f0-9-]+/);

  // Extract the Query Definition node's own ID from its detail-page URL.
  const queryNodeUrlMatch = /\/node\/([a-f0-9-]+)$/.exec(page.url());
  if (!queryNodeUrlMatch) {
    throw new Error(`Could not extract Query Definition node ID from URL: ${page.url()}`);
  }
  const queryNodeId = queryNodeUrlMatch[1];
  if (queryNodeId === undefined) {
    throw new Error('Query node ID match group was undefined');
  }

  // 6. Instantiate a real CadenceAction node whose `target` points at the Query Definition.
  await page.getByRole('button', { name: 'New Node' }).click();
  const newActionDialog = page.getByRole('dialog');
  await newActionDialog.locator('select').selectOption({ label: 'CadenceAction' });
  await newActionDialog.getByLabel('actionKind *').fill('rerun-query');
  await expect(newActionDialog.getByLabel('target')).toBeVisible();
  await newActionDialog.getByLabel('target').fill(queryNodeId);
  await expect(newActionDialog.getByLabel('description')).toBeVisible();
  await newActionDialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/node\/[a-f0-9-]+/);

  // Round-trip check: the created CadenceAction's raw property data shows
  // `target` holding the exact Query Definition node ID.
  await expect(page.locator('[data-node-id]')).toContainText(queryNodeId);
}

async function cleanUpGraph(page: Page): Promise<void> {
  // 7. Clean up: delete the test graph.
  await page.getByRole('link', { name: 'Database' }).click();
  await expect(page).toHaveURL('/');
  const card = page.locator('.group', { hasText: 'Query Definition E2E Graph' });
  await card.hover();
  await card.getByRole('button').click();
  await expect(page.locator('text=Query Definition E2E Graph')).toHaveCount(0);
}

test.describe('QueryDefinition instantiation UI path (canopy-2qu)', () => {
  test('allows creating a QueryDefinition instance and referencing it in a CadenceAction', async ({
    page,
  }) => {
    await createAndOpenGraph(page);
    await createCadenceNamespace(page);
    await createCadenceActionNodeType(page);
    await instantiateNodes(page);
    await cleanUpGraph(page);
  });
});
