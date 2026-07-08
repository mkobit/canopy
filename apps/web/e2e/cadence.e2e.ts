import { test, expect, type Locator, type Page } from '@playwright/test';

async function createAndOpenGraph(page: Page): Promise<void> {
  // 1. Create a fresh graph and open it.
  await page.goto('/');
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') {
      await dialog.accept('Cadence E2E Graph');
    } else if (dialog.type() === 'confirm') {
      await dialog.accept();
    }
  });
  await page.getByRole('button', { name: 'Create Graph' }).click();
  const graphCard = page.locator('text=Cadence E2E Graph');
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
  // Scoped to the exact "cadence" heading rather than a substring match on the
  // whole card -- domain-content-types.e2e.ts needed this fix for "content"
  // since bootstrap's default namespace descriptions ("Default namespace for
  // user-created content.", "Namespace for content imported from external
  // sources.") both contain that substring. Kept here for consistency even
  // though no default namespace description happens to contain "cadence".
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

// Shared by createNodeTypes below: each NodeType form submission adds one or more
// inline property rows, each requiring the same click-then-fill sequence.
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
  const nodeTypeForm = page.locator('form', {
    has: page.getByRole('heading', { name: 'New NodeType' }),
  });

  // 4. Create the Cadence NodeType: name, rrule, phases (all required, inline
  //    text -- rrule is an RRULE string, phases a JSON-encoded {name,minutes}[]).
  await nodeTypeForm.getByLabel('Name').fill('Cadence');
  await addInlineProperty(nodeTypeForm, 'name', { required: true });
  await addInlineProperty(nodeTypeForm, 'rrule', { required: true });
  await addInlineProperty(nodeTypeForm, 'phases', { required: true });
  await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
  const cadenceItem = page.locator('li', { hasText: 'Cadence' });
  await expect(cadenceItem).toBeVisible();
  await expect(cadenceItem).toContainText('3 properties');

  // 5. Create the CadenceAction NodeType: actionKind (required, free-form
  //    text), target (optional, reference), description (optional, text).
  await nodeTypeForm.getByLabel('Name').fill('CadenceAction');
  await addInlineProperty(nodeTypeForm, 'actionKind', { required: true });
  await addInlineProperty(nodeTypeForm, 'target', { valueKind: 'reference' });
  await addInlineProperty(nodeTypeForm, 'description');
  await nodeTypeForm.getByRole('button', { name: 'Create NodeType' }).click();
  const cadenceActionItem = page.locator('li', { hasText: 'CadenceAction' });
  await expect(cadenceActionItem).toBeVisible();
  await expect(cadenceActionItem).toContainText('3 properties');
}

async function createTriggersEdgeType(page: Page): Promise<void> {
  const edgeTypeForm = page.locator('form', {
    has: page.getByRole('heading', { name: 'New EdgeType' }),
  });
  const sourceTypesBox = edgeTypeForm.locator('div.max-h-32').first();
  const targetTypesBox = edgeTypeForm.locator('div.max-h-32').nth(1);

  // 6. Create the triggers EdgeType: Cadence -> CadenceAction.
  // `{ exact: true }` matters on both selectors here: the EdgeType form's
  // "Name" field substring-matches any "system/Namespace" NodeType checkbox
  // ("Namespace" contains "Name"), the same collision domain-content-types.e2e.ts
  // hit; and "cadence/Cadence" is itself a substring-match prefix of
  // "cadence/CadenceAction", a new collision this test introduces.
  await edgeTypeForm.getByLabel('Name', { exact: true }).fill('triggers');
  await sourceTypesBox.getByLabel('cadence/Cadence', { exact: true }).check();
  await targetTypesBox.getByLabel('cadence/CadenceAction', { exact: true }).check();
  await edgeTypeForm.getByRole('button', { name: 'Create EdgeType' }).click();
  const triggersItem = page.locator('li', { hasText: 'triggers' });
  await expect(triggersItem).toBeVisible();
  // sourceTypes/targetTypes render as raw NodeIds (see EdgeTypeList in
  // schema-namespace-page.tsx), not "namespace/Name" strings, and those IDs are
  // freshly generated so can't be predicted here -- just confirm the
  // source/target line isn't the unrestricted "any -> any" default.
  await expect(triggersItem.locator('p.font-mono')).not.toContainText('any -> any');
}

test.describe('cadence domain content type (canopy-ayv)', () => {
  test('dogfoods the Schema UI to author Cadence/CadenceAction and instantiate them', async ({
    page,
  }) => {
    await createAndOpenGraph(page);
    await createCadenceNamespace(page);
    await createNodeTypes(page);
    await createTriggersEdgeType(page);
  });
});
