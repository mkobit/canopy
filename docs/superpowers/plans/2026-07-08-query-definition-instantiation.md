# QueryDefinition instantiation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `QueryDefinition` a UI path to instantiate from the web app's "New Node" dialog.
This will allow pointing `CadenceAction.target` at a real `QueryDefinition` instance in E2E tests.

**Architecture:**

- Modify `apps/web/src/utils/node-types.ts` to add `SYSTEM_IDS.QUERY_DEFINITION_DEF` to `LEGACY_ALLOWED_TYPE_DEF_IDS`.
- Create a new Playwright E2E test `apps/web/e2e/query-definition.e2e.ts`.

**Tech Stack:** TypeScript, React, Playwright, Bun test runner.

**Design doc:** `docs/design/2026-07-08-query-definition-instantiation.md`
**Bead:** `canopy-2qu`

---

### Task 1: Expose QueryDefinition in listAllowedNodeTypes

**Files:**

- Modify: [node-types.ts](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/utils/node-types.ts)
- Modify: [node-types.test.ts](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/utils/__tests__/node-types.test.ts)

- [ ] **Step 1: Add QUERY_DEFINITION_DEF to the allowed list**

Edit `apps/web/src/utils/node-types.ts` to include `SYSTEM_IDS.QUERY_DEFINITION_DEF` in `LEGACY_ALLOWED_TYPE_DEF_IDS`.

- [ ] **Step 2: Update the unit test**

Edit `apps/web/src/utils/__tests__/node-types.test.ts` to assert that `SYSTEM_IDS.QUERY_DEFINITION` is now contained in the allowed node type IDs.

- [ ] **Step 3: Run the unit test to verify**

Run the node-types unit test.

- [ ] **Step 4: Commit the change**

Commit the unit test and source changes.

---

### Task 2: Scaffold E2E test for QueryDefinition instantiation

**Files:**

- Create: `apps/web/e2e/query-definition.e2e.ts`

- [ ] **Step 1: Write the test code**

Create the E2E test file to setup the graph, namespace, and NodeType.
Open the New Node dialog to instantiate a `QueryDefinition` node.
Reference that `QueryDefinition` node in a `CadenceAction` node.

- [ ] **Step 2: Run the E2E test**

Run the Playwright test.

- [ ] **Step 3: Clean up and run quality gates**

Run quality gates.

- [ ] **Step 4: Commit and push**

Commit the E2E test file and push the changes.
