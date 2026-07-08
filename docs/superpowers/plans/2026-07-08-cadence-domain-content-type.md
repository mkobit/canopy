# Cadence domain content type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dogfood the type-authoring control plane a second time by authoring a generic `cadence` namespace (Cadence + CadenceAction NodeTypes, one `triggers` EdgeType) through the Schema UI, proven via a new Playwright e2e test that also exercises the `reference` `PropertyValueKind` end-to-end for the first time.

**Architecture:** No new UI, ops, or source fixes are needed — unlike `canopy-goi` (which needed `listAllowedNodeTypes` fixed in Task 1), that function already includes any NodeType in a non-restricted namespace, and `reference` is already a fully wired `PropertyValueKind` (`PropertyInput`/`PropertyDisplay`/`NewNodeDialog` all handle it). This plan is purely additive: one new file, `apps/web/e2e/cadence.e2e.ts`, built with per-phase helper functions from the start (mirroring `domain-content-types.e2e.ts`'s final, lint-clean shape) that drives the real Schema UI to create the `cadence` namespace, the `Cadence`/`CadenceAction` NodeTypes, the `triggers` EdgeType, then instantiates one real node of each type — wiring `CadenceAction.target` to the `Cadence` node's own ID to prove `reference` properties round-trip through the New Node dialog.

**Tech Stack:** TypeScript, React, Playwright, Bun test runner, `@canopy/graph` (pure functional graph ops).

**Design doc:** `docs/design/2026-07-07-cadence-domain-content-type.md`
**Bead:** `canopy-ayv`

---

### Task 1: Claim the bead, scaffold the e2e test — graph and `cadence` namespace

**Files:**
- Create: `apps/web/e2e/cadence.e2e.ts`

- [ ] **Step 1: Claim the bead**

Run: `bd update canopy-ayv --claim`

- [ ] **Step 2: Create the file with graph setup and namespace creation**

```ts
import { test, expect, type Page } from '@playwright/test';

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

test.describe('cadence domain content type (canopy-ayv)', () => {
  test('dogfoods the Schema UI to author Cadence/CadenceAction and instantiate them', async ({
    page,
  }) => {
    await createAndOpenGraph(page);
    await createCadenceNamespace(page);
  });
});
```

- [ ] **Step 3: Run it**

Run: `cd apps/web && bunx playwright test cadence.e2e.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/cadence.e2e.ts
git commit -m "test(web): scaffold cadence e2e — graph + cadence namespace (canopy-ayv)"
```

---

### Task 2: Author the Cadence and CadenceAction NodeTypes

**Files:**
- Modify: `apps/web/e2e/cadence.e2e.ts`

- [ ] **Step 1: Add the `Locator` import, the `addInlineProperty` helper, and `createNodeTypes`**

Change the import line at the top of the file:

```ts
import { test, expect, type Locator, type Page } from '@playwright/test';
```

Insert after `createCadenceNamespace` (before the `test.describe` block):

```ts
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
```

Add the call in `test.describe`, right after `createCadenceNamespace(page);`:

```ts
    await createNodeTypes(page);
```

- [ ] **Step 2: Run it**

Run: `cd apps/web && bunx playwright test cadence.e2e.ts`
Expected: PASS.

If `cadenceItem`/`cadenceActionItem` assertions fail with a strict-mode "multiple elements" error: `page.locator('li', { hasText: 'Cadence' })` is checked for visibility *before* `CadenceAction` exists, so it can only match one `<li>` at that point — if this still fails, check the DOM against the live page in Playwright's trace viewer rather than guessing.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/cadence.e2e.ts
git commit -m "test(web): author Cadence and CadenceAction NodeTypes in cadence e2e (canopy-ayv)"
```

---

### Task 3: Author the `triggers` EdgeType

**Files:**
- Modify: `apps/web/e2e/cadence.e2e.ts`

- [ ] **Step 1: Add `createTriggersEdgeType`**

Insert after `createNodeTypes` (before `test.describe`):

```ts
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
```

Add the call in `test.describe`, right after `createNodeTypes(page);`:

```ts
    await createTriggersEdgeType(page);
```

- [ ] **Step 2: Run it**

Run: `cd apps/web && bunx playwright test cadence.e2e.ts`
Expected: PASS.

If the source/target checkbox `.check()` calls throw a strict-mode violation naming both `cadence/Cadence` and `cadence/CadenceAction`, the `{ exact: true }` above was dropped or misapplied — re-check both checkbox selectors before touching anything else.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/cadence.e2e.ts
git commit -m "test(web): author triggers EdgeType in cadence e2e (canopy-ayv)"
```

---

### Task 4: Instantiate real Cadence + CadenceAction nodes and clean up

**Files:**
- Modify: `apps/web/e2e/cadence.e2e.ts`

- [ ] **Step 1: Add `instantiateCadenceNodes` and `cleanUpGraph`**

Insert after `createTriggersEdgeType` (before `test.describe`):

```ts
async function instantiateCadenceNodes(page: Page): Promise<void> {
  // 7. Instantiate a real Cadence node via the New Node dialog.
  await page.getByRole('button', { name: 'New Node' }).click();
  const newCadenceDialog = page.getByRole('dialog');
  await newCadenceDialog.getByLabel('Type').selectOption({ label: 'Cadence' });
  await newCadenceDialog.getByLabel('name *').fill('Pomodoro');
  await newCadenceDialog.getByLabel('rrule *').fill('FREQ=DAILY;COUNT=4');
  await newCadenceDialog
    .getByLabel('phases *')
    .fill('[{"name":"work","minutes":25},{"name":"break","minutes":5}]');
  await newCadenceDialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/node\/[a-f0-9-]+/);

  // Extract the Cadence node's own ID from its detail-page URL. There is no
  // real QueryDefinition instance to point CadenceAction.target at yet
  // (QueryDefinition lives in the restricted `system` namespace with no UI
  // path to instantiate it), so the Cadence node's own ID stands in as a
  // placeholder pointer -- this only needs to prove `reference` is fillable
  // and submittable end-to-end via the New Node dialog, not model a real
  // trigger relationship.
  const cadenceNodeUrlMatch = /\/node\/([a-f0-9-]+)$/.exec(page.url());
  if (!cadenceNodeUrlMatch) {
    throw new Error(`Could not extract Cadence node ID from URL: ${page.url()}`);
  }
  const [, cadenceNodeId] = cadenceNodeUrlMatch;

  // 8. Instantiate a real CadenceAction node whose `target` points at the
  //    Cadence node above -- proves the `reference` PropertyValueKind is
  //    usable via the New Node dialog, which no prior e2e test has exercised
  //    (canopy-goi's `status` property used `text`, not `reference`).
  await page.getByRole('button', { name: 'New Node' }).click();
  const newActionDialog = page.getByRole('dialog');
  await newActionDialog.getByLabel('Type').selectOption({ label: 'CadenceAction' });
  await newActionDialog.getByLabel('actionKind *').fill('rerun-query');
  await expect(newActionDialog.getByLabel('target')).toBeVisible();
  await newActionDialog.getByLabel('target').fill(cadenceNodeId);
  await expect(newActionDialog.getByLabel('description')).toBeVisible();
  await newActionDialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/graph\/[a-f0-9-]+\/node\/[a-f0-9-]+/);

  // Round-trip check: the created CadenceAction's raw property data (NodeView,
  // rendered inside the node detail page's "Raw Node Data" panel) shows
  // `target` holding the exact Cadence node ID -- confirms the reference value
  // was actually persisted, not just that the form submitted and navigated.
  await expect(page.locator('[data-node-id]')).toContainText(cadenceNodeId);
}

async function cleanUpGraph(page: Page): Promise<void> {
  // 9. Clean up: delete the test graph.
  await page.getByRole('link', { name: 'Database' }).click();
  await expect(page).toHaveURL('/');
  const card = page.locator('.group', { hasText: 'Cadence E2E Graph' });
  await card.hover();
  await card.getByRole('button').click();
  await expect(page.locator('text=Cadence E2E Graph')).toHaveCount(0);
}
```

Add the calls in `test.describe`, right after `createTriggersEdgeType(page);`, completing the test body:

```ts
    await instantiateCadenceNodes(page);
    await cleanUpGraph(page);
```

- [ ] **Step 2: Run it**

Run: `cd apps/web && bunx playwright test cadence.e2e.ts`
Expected: PASS.

If `newCadenceDialog.getByLabel('name *')` (or `rrule *`/`phases *`) doesn't match: confirm the dialog is scoped correctly (`page.getByRole('dialog')`) — an unscoped `getByLabel` collides with the still-mounted EdgeType/NodeType form checkboxes behind the dialog, the same 7-way strict-mode violation `domain-content-types.e2e.ts` hit and fixed by scoping to the dialog.

If the final `toContainText(cadenceNodeId)` assertion fails: confirm only one element on the page has a `data-node-id` attribute (it's set by `NodeView`, used for the "Raw Node Data" panel on the node detail page) — if another `NodeView` instance is rendered elsewhere on this page, narrow the locator further (e.g. scope to a "Raw Node Data" heading's sibling container).

- [ ] **Step 3: Run the full e2e suite**

Run: `cd apps/web && bun run test:e2e`
Expected: PASS — `smoke.e2e.ts`, `schema.e2e.ts`, `domain-content-types.e2e.ts`, `block-editor.e2e.ts`, and the new `cadence.e2e.ts`, no regressions.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/cadence.e2e.ts
git commit -m "test(web): instantiate Cadence/CadenceAction nodes, prove reference round-trip (canopy-ayv)"
```

---

### Task 5: Quality gates, bd bookkeeping, and PR

**Files:** none (verification and process only)

- [ ] **Step 1: Run full quality gates from the repo root**

```bash
bun run typecheck
bun run lint
bun run test
```

Expected: all clean. If `lint` surfaces `max-lines-per-function` or `functional/no-let` violations in `cadence.e2e.ts`, fix by extracting further helper functions (the same fix `domain-content-types.e2e.ts` needed) — the file was already written with per-phase helpers from Task 1 onward specifically to avoid this, but verify rather than assume.

- [ ] **Step 2: Run the full e2e suite once more from a clean state**

Run: `cd apps/web && bun run test:e2e`
Expected: PASS, all 5 specs.

- [ ] **Step 3: Update bd**

```bash
bd close canopy-ayv --reason="Landed cadence namespace (Cadence/CadenceAction NodeTypes, triggers EdgeType) via Schema UI, proven by apps/web/e2e/cadence.e2e.ts"
bd update canopy-6cz --notes="Second domain type now landed (canopy-ayv, cadence namespace, separate from content) — this is the real second data point the deferred namespace-per-domain design question was waiting on. Revisit the single-namespace-vs-per-domain tradeoff now that there's cadence + content to compare, not just content alone."
```

- [ ] **Step 4: Push the branch and open a PR**

```bash
git push -u origin feat/canopy-ayv-cadence-domain-content-type
gh pr create --title "feat(web): dogfood cadence domain content type (canopy-ayv)" --body "$(cat <<'EOF'
## Summary
- Authors a `cadence` namespace (Cadence + CadenceAction NodeTypes, one `triggers` EdgeType) through the existing type-authoring control plane's Schema UI — the second dogfood of that control plane after Task/Project/Person (canopy-goi, PR #353) — proven via a new Playwright e2e test, not hardcoded into bootstrap.ts.
- The model is a generic recurring-trigger mechanism (Pomodoro is one use case, not the whole concept); no source changes were needed this time, since `listAllowedNodeTypes` already supports arbitrary non-restricted namespaces and `reference` is already a fully wired `PropertyValueKind`.
- The new e2e test is the first to exercise the `reference` PropertyValueKind end-to-end via the New Node dialog (canopy-goi's `status` property used `text`), including a round-trip check that the persisted value matches what was entered.
- Provides the concrete second domain type canopy-6cz (namespace-per-domain design question) was waiting on before being revisited.

Design: docs/design/2026-07-07-cadence-domain-content-type.md
Bead: canopy-ayv

## Test plan
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run test`
- [x] `cd apps/web && bun run test:e2e` (all 5 specs)
EOF
)"
```

Report the PR URL back once created.
