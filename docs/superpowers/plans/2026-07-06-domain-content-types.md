# Domain content types (Task/Project/Person) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dogfood the existing type-authoring control plane by authoring Task/Project/Person as real, runtime-defined NodeTypes through the Schema UI (proven via a new Playwright e2e test), and fix the one real bug this surfaces — the "New Node" dialog can't instantiate any dynamically-authored NodeType.

**Architecture:** No new UI or ops — `createNamespace`/`createNodeType`/`createEdgeType`/`createPropertyType` and the Schema UI already exist (`canopy-9zj`). This plan (1) fixes `apps/web/src/utils/node-types.ts`'s `listAllowedNodeTypes`, which currently only allows 3 hardcoded system NodeTypes into the "New Node" dialog, so it also allows dynamically-authored ones; and (2) adds `apps/web/e2e/domain-content-types.e2e.ts`, a Playwright test that drives the real Schema UI to create a `content` namespace, a shared `status` PropertyType, `Person`/`Project`/`Task` NodeTypes, and `belongs_to`/`assigned_to` EdgeTypes, then instantiates a real Task node to prove it's usable.

**Tech Stack:** TypeScript, React, Playwright, Bun test runner, `@canopy/graph` (pure functional graph ops).

**Design doc:** `docs/design/2026-07-06-domain-content-types.md`

**Progress (2026-07-06):** Task 1 done, commit `d95540a`. Task 2 done, commit `c2d6833` (see corrected code below — the original plan's `namespaceLink` selector was ambiguous and got fixed during implementation). Task 3 done, commit `076e9b0` (draft code worked verbatim, no deviations). Task 4 done, commit `1d0b07a` (fixed one selector: `getByLabel('Name')` needed `{ exact: true }` since it substring-matched the `system/Namespace` checkbox label). Task 5 done, commit `b57fdfb` (fixed New Node dialog selectors: scoped to `page.getByRole('dialog')` since the unscoped `Type` select's accessible name concatenates all option text, colliding with background EdgeType-form checkboxes). Task 6 not started.

---

### Task 1: Fix `listAllowedNodeTypes` to include dynamically-authored NodeTypes

**Why this is first:** the e2e test in Task 4 instantiates a `Task` node via the "New Node" dialog. That dialog's type picker is populated by `listAllowedNodeTypes`, which today is a hardcoded 3-ID allowlist (`MarkdownNode`/`CodeBlock`/`TextBlock`) predating the type-authoring control plane — a dynamically-created `Task` NodeType would never appear in it. Fixing this first means Task 4 can rely on it working.

**Files:**

- Modify: `apps/web/src/utils/node-types.ts`
- Modify: `apps/web/src/components/layout.tsx:8,20`
- Modify: `apps/web/src/utils/__tests__/node-types.test.ts`
- Modify: `apps/web/src/context/__tests__/graph-integration.test.tsx:259`

- [x] **Step 1: Write the failing unit tests** (done)

Replace the full contents of `apps/web/src/utils/__tests__/node-types.test.ts` with:

```ts
import { describe, it, expect } from 'bun:test';
import {
  SYSTEM_IDS,
  asGraphId,
  asDeviceId,
  createGraph,
  createNamespace,
  createNodeType,
  unwrap,
} from '@canopy/graph';
import { listNamespaces } from '../schema';
import { listAllowedNodeTypes } from '../node-types';

const DEVICE_ID = asDeviceId('00000000-0000-0000-0000-000000000000');
const OPTIONS = { deviceId: DEVICE_ID };

function bootstrappedGraph() {
  return unwrap(createGraph(asGraphId('test-node-types'), 'Test'));
}

describe('listAllowedNodeTypes', () => {
  it('returns Markdown, CodeBlock, and TextBlock from a bootstrapped graph', () => {
    const graph = bootstrappedGraph();
    const types = listAllowedNodeTypes(graph, listNamespaces(graph));
    const ids = types.map((t) => t.id);
    expect(ids).toContain(SYSTEM_IDS.TYPE_MARKDOWN);
    expect(ids).toContain(SYSTEM_IDS.TYPE_CODE_BLOCK);
    expect(ids).toContain(SYSTEM_IDS.TYPE_TEXT_BLOCK);
  });

  it('excludes meta-types', () => {
    const graph = bootstrappedGraph();
    const ids = listAllowedNodeTypes(graph, listNamespaces(graph)).map((t) => t.id);
    expect(ids).not.toContain(SYSTEM_IDS.NODE_TYPE);
    expect(ids).not.toContain(SYSTEM_IDS.EDGE_TYPE);
    expect(ids).not.toContain(SYSTEM_IDS.QUERY_DEFINITION);
    expect(ids).not.toContain(SYSTEM_IDS.VIEW_DEFINITION);
    expect(ids).not.toContain(SYSTEM_IDS.TEMPLATE);
    expect(ids).not.toContain(SYSTEM_IDS.RENDERER);
    expect(ids).not.toContain(SYSTEM_IDS.SETTINGS_SCHEMA);
    expect(ids).not.toContain(SYSTEM_IDS.USER_SETTING);
  });

  it('parses each type’s PropertyDefinition[] from its JSON-string properties field', () => {
    const graph = bootstrappedGraph();
    const types = listAllowedNodeTypes(graph, listNamespaces(graph));
    const markdown = types.find((t) => t.id === SYSTEM_IDS.TYPE_MARKDOWN);
    expect(markdown).toBeDefined();
    expect(markdown?.properties).toEqual([
      {
        name: 'content',
        valueKind: 'text',
        required: true,
        description: 'Markdown content',
      },
    ]);

    const codeBlock = types.find((t) => t.id === SYSTEM_IDS.TYPE_CODE_BLOCK);
    expect(codeBlock?.properties.map((p) => p.name)).toEqual(['content', 'language']);
    expect(codeBlock?.properties.find((p) => p.name === 'content')?.required).toBe(true);
    expect(codeBlock?.properties.find((p) => p.name === 'language')?.required).toBe(false);
  });

  it('exposes label and description from the type-def node properties', () => {
    const graph = bootstrappedGraph();
    const types = listAllowedNodeTypes(graph, listNamespaces(graph));
    const markdown = types.find((t) => t.id === SYSTEM_IDS.TYPE_MARKDOWN);
    expect(markdown?.label).toBe('MarkdownNode');
    expect(markdown?.description).toBe('A node containing markdown content.');
  });

  it('includes a dynamically-authored NodeType in a non-restricted namespace', () => {
    const afterNamespace = unwrap(
      createNamespace(bootstrappedGraph(), { name: 'content', kind: 'user' }, OPTIONS),
    ).value;
    const afterNodeType = unwrap(
      createNodeType(
        afterNamespace,
        {
          name: 'Task',
          namespace: 'content',
          properties: [{ kind: 'inline', name: 'title', valueKind: 'text', required: true }],
        },
        OPTIONS,
      ),
    ).value;

    const types = listAllowedNodeTypes(afterNodeType, listNamespaces(afterNodeType));
    expect(types.some((t) => t.label === 'Task')).toBe(true);
  });

  it('still excludes UserSetting even though its namespace (user-settings) is not restricted', () => {
    const graph = bootstrappedGraph();
    const ids = listAllowedNodeTypes(graph, listNamespaces(graph)).map((t) => t.id);
    expect(ids).not.toContain(SYSTEM_IDS.USER_SETTING);
  });
});
```

- [x] **Step 2: Run the tests to confirm they fail on the current code** (done — failed as a plain assertion, not a type error, since `bun test` doesn't type-check; see progress note)

Run: `cd apps/web && bun test src/utils/__tests__/node-types.test.ts`
Expected: FAIL — a TypeScript/argument-count error, since `listAllowedNodeTypes` currently takes only one argument (`graph`), not two.

- [x] **Step 3: Implement the fix in `node-types.ts`** (done)

Replace the full contents of `apps/web/src/utils/node-types.ts` with:

```ts
import {
  SYSTEM_IDS,
  RESTRICTED_NAMESPACE_KINDS,
  asTypeId,
  fromThrowable,
  PropertyDefinitionSchema,
  type Graph,
  type Node,
  type PropertyDefinition,
  type TypeId,
} from '@canopy/graph';
import { z } from 'zod';
import type { NamespaceOption } from './schema';

export interface NodeTypeOption {
  readonly id: TypeId;
  readonly label: string;
  readonly description: string | undefined;
  readonly properties: readonly PropertyDefinition[];
}

// TextBlock/CodeBlock/MarkdownNode are bootstrap-seeded into the restricted `system`
// namespace (a pre-existing placement quirk, unrelated to this fix) but must stay
// instantiable -- unlike the rest of `system`'s machinery types.
const LEGACY_ALLOWED_TYPE_DEF_IDS: ReadonlySet<string> = new Set([
  SYSTEM_IDS.NODE_TYPE_MARKDOWN,
  SYSTEM_IDS.NODE_TYPE_CODE_BLOCK,
  SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK,
]);

// UserSetting lives in the non-restricted `user-settings` namespace despite being
// settings-cascade machinery, not user content -- namespace restriction alone can't
// tell the two apart, so exclude it explicitly.
const EXCLUDED_TYPE_DEF_IDS: ReadonlySet<string> = new Set([SYSTEM_IDS.USER_SETTING_DEF]);

const PropertyDefinitionsSchema = z.array(PropertyDefinitionSchema);

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function parseProperties(raw: unknown): readonly PropertyDefinition[] {
  const text = readString(raw);
  if (text === undefined) return [];
  const parsedJson = fromThrowable(() => JSON.parse(text) as unknown);
  if (!parsedJson.ok) return [];
  const parsed = PropertyDefinitionsSchema.safeParse(parsedJson.value);
  return parsed.success ? parsed.data : [];
}

function isInstantiable(node: Node, kindByNamespace: ReadonlyMap<string, string>): boolean {
  if (LEGACY_ALLOWED_TYPE_DEF_IDS.has(node.id)) return true;
  if (EXCLUDED_TYPE_DEF_IDS.has(node.id)) return false;
  const namespace = readString(node.properties.get('namespace'));
  const kind = namespace ? kindByNamespace.get(namespace) : undefined;
  return kind !== undefined && !RESTRICTED_NAMESPACE_KINDS.has(kind);
}

export function listAllowedNodeTypes(
  graph: Graph,
  namespaces: readonly NamespaceOption[],
): readonly NodeTypeOption[] {
  const kindByNamespace = new Map<string, string>(namespaces.map((ns) => [ns.name, ns.kind]));
  return [...graph.nodes.values()]
    .filter((node) => node.type === SYSTEM_IDS.NODE_TYPE && isInstantiable(node, kindByNamespace))
    .map((node) => ({
      id: asTypeId(node.id),
      label: readString(node.properties.get('name')) ?? node.id,
      description: readString(node.properties.get('description')),
      properties: parseProperties(node.properties.get('properties')),
    }));
}
```

- [x] **Step 4: Update the two call sites** (done)

In `apps/web/src/components/layout.tsx`, change line 8 and line 20:

```ts
import { listAllowedNodeTypes } from '../utils/node-types';
import { listNamespaces } from '../utils/schema';
```

```ts
const availableTypes = useMemo(
  () => (graph ? listAllowedNodeTypes(graph, listNamespaces(graph)) : []),
  [graph],
);
```

In `apps/web/src/context/__tests__/graph-integration.test.tsx`, add the import near the existing `listAllowedNodeTypes` import (around line 10):

```ts
import { listNamespaces } from '../../utils/schema';
```

And change line 259 from `const types = listAllowedNodeTypes(graph);` to:

```ts
const types = listAllowedNodeTypes(graph, listNamespaces(graph));
```

- [x] **Step 5: Run both test files to confirm they pass** (done — use `bun test <files> --preload ./src/test/setup.ts` from `apps/web`; the plan's plain command was missing the happy-dom preload that `apps/web/package.json`'s own `test` script includes, causing a `localStorage is not defined` error unrelated to this fix)

Run: `cd apps/web && bun test src/utils/__tests__/node-types.test.ts src/context/__tests__/graph-integration.test.tsx`
Expected: PASS, all tests including the 2 new ones in `node-types.test.ts`.

- [x] **Step 6: Typecheck** (done, 0 errors)

Run: `cd apps/web && bun run typecheck`
Expected: no errors.

- [x] **Step 7: Commit** (done, commit `d95540a`)

```bash
git add apps/web/src/utils/node-types.ts apps/web/src/components/layout.tsx apps/web/src/utils/__tests__/node-types.test.ts apps/web/src/context/__tests__/graph-integration.test.tsx
git commit -m "fix(web): let New Node dialog instantiate dynamically-authored NodeTypes

listAllowedNodeTypes only allowed 3 hardcoded system NodeTypes, predating
the type-authoring control plane -- any NodeType created through the Schema
UI could never be instantiated. Now includes any NodeType in a
non-restricted namespace, with UserSetting explicitly excluded since it's
settings-cascade machinery living in a non-restricted namespace."
```

---

### Task 2: Scaffold the e2e test — graph, namespace, PropertyType

**Files:**

- Create: `apps/web/e2e/domain-content-types.e2e.ts`

- [x] **Step 1: Create the file with graph setup, namespace, and status PropertyType creation** (done — actual committed code below, corrected from the original draft)

```ts
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
  });
});
```

- [x] **Step 2: Run it** (done — passed: `1 passed (2.8s)`)

Run: `cd apps/web && bunx playwright test domain-content-types.e2e.ts`
Expected: PASS.

- [x] **Step 3: Commit** (done, commit `c2d6833`)

```bash
git add apps/web/e2e/domain-content-types.e2e.ts
git commit -m "test(web): scaffold domain content types e2e — namespace + status PropertyType"
```

**Note for Task 3+:** watch for the same substring-ambiguity trap with other `hasText`/`filter` selectors — verify uniqueness against the full page text before trusting a plain substring match, the way the `namespaceLink` fix above did.

---

### Task 3: Author Person, Project, and Task NodeTypes

**Files:**

- Modify: `apps/web/e2e/domain-content-types.e2e.ts`

- [x] **Step 1: Add NodeType creation steps before the closing `});`** (done, commit `076e9b0`)

Insert after the PropertyType assertion from Task 2, still inside the same `test(...)` callback:

```ts
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
await expect(nodeTypeForm.locator('option', { hasText: 'content/status (text)' })).toBeAttached();

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
```

- [x] **Step 2: Run it** (done — passed: `1 passed (4.7s)`, draft selectors worked verbatim)

- [x] **Step 3: Commit** (done, commit `076e9b0`)

---

### Task 4: Author belongs_to and assigned_to EdgeTypes

**Files:**

- Modify: `apps/web/e2e/domain-content-types.e2e.ts`

- [x] **Step 1: Add EdgeType creation steps** (done, commit `1d0b07a` — fixed `getByLabel('Name')` to `getByLabel('Name', { exact: true })`, see progress note)

Insert after the Task NodeType assertions from Task 3:

```ts
// 8. Create the belongs_to EdgeType: Task -> Project.
const edgeTypeForm = page.locator('form', {
  has: page.getByRole('heading', { name: 'New EdgeType' }),
});
const sourceTypesBox = edgeTypeForm.locator('div.max-h-32').first();
const targetTypesBox = edgeTypeForm.locator('div.max-h-32').nth(1);

await edgeTypeForm.getByLabel('Name').fill('belongs_to');
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
await edgeTypeForm.getByLabel('Name').fill('assigned_to');
await sourceTypesBox.getByLabel('content/Task').check();
await targetTypesBox.getByLabel('content/Person').check();
await edgeTypeForm.getByRole('button', { name: 'Create EdgeType' }).click();
const assignedToItem = page.locator('li', { hasText: 'assigned_to' });
await expect(assignedToItem).toBeVisible();
await expect(assignedToItem.locator('p.font-mono')).not.toContainText('any -> any');
```

- [x] **Step 2: Run it** (done — passed: `1 passed (5.3s)`)

- [x] **Step 3: Commit** (done, commit `1d0b07a`)

---

### Task 5: Instantiate a real Task node and clean up

**Files:**

- Modify: `apps/web/e2e/domain-content-types.e2e.ts`

- [x] **Step 1: Add New Node dialog interaction and graph cleanup** (done, commit `b57fdfb` — scoped New Node selectors to `page.getByRole('dialog')`, see progress note)

Insert after the EdgeType assertions from Task 4, before the closing of the test function:

```ts
    // 10. Instantiate a real Task node via the New Node dialog -- proves the
    //     type is usable, not just definable (also exercises the Task 1 fix).
    await page.getByRole('button', { name: 'New Node' }).click();
    await page.getByLabel('Type').selectOption({ label: 'Task' });
    await page.getByLabel('title *').fill('Write the domain content types e2e test');
    await expect(page.getByLabel('status')).toBeVisible();
    await expect(page.getByLabel('priority')).toBeVisible();
    await expect(page.getByLabel('dueDate')).toBeVisible();
    await expect(page.getByLabel('description')).toBeVisible();
    await page.getByRole('button', { name: 'Create' }).click();
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
```

- [x] **Step 2: Run the full e2e suite** (done — 4 passed: `smoke.e2e.ts`, `schema.e2e.ts`, `domain-content-types.e2e.ts`, and pre-existing `block-editor.e2e.ts`)

- [x] **Step 3: Commit** (done, commit `b57fdfb`)

---

### Task 6: Quality gates, bd bookkeeping, and PR

**Files:** none (verification and process only)

- [x] **Step 1: Run full quality gates from the repo root** (done — typecheck/test passed clean; lint surfaced real `max-lines-per-function`/`functional/no-let` violations in the e2e file itself, not the stale-dist gotcha; fixed by refactoring into helper functions, commit `023f5c5`)

- [x] **Step 2: Run the full e2e suite once more from a clean state** (done — 4 passed)

- [x] **Step 3: Update bd** (done — canopy-goi closed)

- [ ] **Step 4: Push the branch and open a PR**

```bash
git push -u origin feat/canopy-goi-domain-content-types
gh pr create --title "feat(web): dogfood domain content types (Task/Project/Person) via Schema UI" --body "$(cat <<'EOF'
## Summary
- Authors Task/Project/Person as real NodeTypes through the type-authoring control plane's Schema UI, per the explicit follow-on noted when that control plane shipped (canopy-9zj) — proven via a new Playwright e2e test, not hardcoded into bootstrap.ts.
- Fixes `listAllowedNodeTypes` (apps/web/src/utils/node-types.ts), which only allowed 3 hardcoded system NodeTypes into the "New Node" dialog — a dynamically-authored NodeType could never be instantiated. Now includes any NodeType in a non-restricted namespace.

Design: docs/design/2026-07-06-domain-content-types.md
Bead: canopy-goi

## Test plan
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run test`
- [x] `cd apps/web && bun run test:e2e` (all 3 specs)
EOF
)"
```

Report the PR URL back once created.
