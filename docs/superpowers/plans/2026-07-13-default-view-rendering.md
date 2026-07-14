# default-view-rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement dynamic node rendering by resolving and dispatching to registered component-kind renderers via the settings cascade.

**Architecture:** Use the settings cascade to resolve a node to its effective `ViewDefinition` node, which references a `Renderer` node.
Map the `entryPoint` of the `Renderer` node to React components using a registry, and recursively render children with cycle safety.

**Tech Stack:** TypeScript, React, @canopy/graph, @canopy/settings, Zod.

---

### Task 1: Schema and Bootstrap Changes

**Files:**
- Modify: [system.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/system.ts)
- Modify: [bootstrap.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/bootstrap.ts)
- Modify: [bootstrap.test.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/bootstrap.test.ts)
- Modify: [cascade.test.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/settings/src/cascade.test.ts)

- [ ] **Step 1: Write the failing tests**
  Add tests to [bootstrap.test.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/bootstrap.test.ts) verifying the existence of the new default view setting, system edge types, default renderers, and default view definitions.
  Also update [cascade.test.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/settings/src/cascade.test.ts) to replace `SETTING_DEFAULT_RENDERER` with `SETTING_DEFAULT_VIEW`.

  Example code additions to [bootstrap.test.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/bootstrap.test.ts):
  ```typescript
  // Inside bootstrap test
  const defaultViewSetting = graph.nodes.get(SYSTEM_IDS.SETTING_DEFAULT_VIEW);
  expect(defaultViewSetting).toBeDefined();
  expect(defaultViewSetting?.properties.get('key')).toBe('default-view');

  const usesRendererEdge = graph.nodes.get(SYSTEM_IDS.EDGE_USES_RENDERER);
  expect(usesRendererEdge).toBeDefined();

  const textRenderer = graph.nodes.get(asNodeId('system:renderer:text'));
  expect(textRenderer).toBeDefined();
  expect(textRenderer?.properties.get('entryPoint')).toBe('system:text');
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `bun test packages/graph/src/bootstrap.test.ts`
  Expected: FAIL with compilation errors on `SYSTEM_IDS.SETTING_DEFAULT_VIEW`.

- [ ] **Step 3: Update system IDs and definitions**
  Update [system.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/system.ts) to define `SETTING_DEFAULT_VIEW` instead of `SETTING_DEFAULT_RENDERER`, and define the new system edge types and `SystemRendererEntryPoint` union.

  ```typescript
  // packages/graph/src/system.ts additions
  export const SYSTEM_IDS = {
    // ...
    SETTING_DEFAULT_VIEW: asNodeId('system:setting:default-view'),
    EDGE_USES_RENDERER: asNodeId('system:edgetype:uses-renderer'),
    EDGE_VIEW_OVERRIDE: asNodeId('system:edgetype:view-override'),
    EDGE_DEFAULT_VIEW: asNodeId('system:edgetype:default-view'),
  };

  export const SYSTEM_EDGE_TYPES = {
    // ...
    USES_RENDERER: asTypeId('system:edgetype:uses-renderer'),
    VIEW_OVERRIDE: asTypeId('system:edgetype:view-override'),
    DEFAULT_VIEW: asTypeId('system:edgetype:default-view'),
  };

  export type SystemRendererEntryPoint = 'system:text' | 'system:code' | 'system:markdown';
  ```

- [ ] **Step 4: Update bootstrap data seeding**
  Update [bootstrap.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/bootstrap.ts) to rename the `default-renderer` setting, register the edge types, and seed the default renderer/view definition nodes and their connecting edges.

- [ ] **Step 5: Run tests to verify they pass**
  Run: `bun test packages/graph/src/bootstrap.test.ts` and `bun test packages/settings/src/cascade.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**
  Run: `git commit -am "feat(graph): update schema and bootstrap system default views"`

---

### Task 2: View Resolution Engine

**Files:**
- Create: [view-resolution.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/settings/src/view-resolution.ts)
- Modify: [index.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/settings/src/index.ts)
- Create: [view-resolution.test.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/settings/tests/view-resolution.test.ts)

- [ ] **Step 1: Write the failing tests**
  Create [view-resolution.test.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/settings/tests/view-resolution.test.ts) with scenarios verifying node override, setting cascade, and system default resolution returning a functional `Result`.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `bun test packages/settings/tests/view-resolution.test.ts`
  Expected: FAIL with import errors or missing implementation.

- [ ] **Step 3: Implement view resolution logic**
  Implement `resolveViewDefinition` returning `Result<Node, Error>` in [view-resolution.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/settings/src/view-resolution.ts).
  Export it from [index.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/settings/src/index.ts).

- [ ] **Step 4: Run tests to verify they pass**
  Run: `bun test packages/settings/tests/view-resolution.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  Run: `git commit -am "feat(settings): implement Result-based resolveViewDefinition cascade"`

---

### Task 3: Web UI Component Registry and Dynamic Dispatch

**Files:**
- Create: [registry.ts](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/renderers/registry.ts)
- Modify: [block-renderer.tsx](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/renderers/block-renderer.tsx)
- Modify: [node-page.tsx](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/pages/node-page.tsx)

- [ ] **Step 1: Create React component registry**
  Create [registry.ts](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/renderers/registry.ts) mapping typed `SystemRendererEntryPoint` string values to Text, Code, and Markdown React components.

  ```typescript
  import type React from 'react';
  import type { Node, Graph, SystemRendererEntryPoint } from '@canopy/graph';
  import { TextBlockRenderer } from './text-block-renderer';
  import { CodeBlockRenderer } from './code-block-renderer';
  import { MarkdownRenderer } from './markdown-renderer';

  export const RENDERER_REGISTRY: Readonly<Record<
    SystemRendererEntryPoint,
    React.FC<Readonly<{ node: Node; graph: Graph; config?: ReadonlyMap<string, any> }>>
  >> = {
    'system:text': TextBlockRenderer,
    'system:code': CodeBlockRenderer,
    'system:markdown': MarkdownRenderer,
  };
  ```

- [ ] **Step 2: Implement dynamic dispatch in BlockRenderer**
  Update [block-renderer.tsx](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/renderers/block-renderer.tsx) to call `resolveViewDefinition`, find the referenced renderer node, and look up the React component in `RENDERER_REGISTRY`.

- [ ] **Step 3: Implement cycle protection**
  In [block-renderer.tsx](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/renderers/block-renderer.tsx), accept a `visited: ReadonlySet<NodeId>` prop.
  Check if `node.id` is already in the set, and halt/render a cycle warning if it is.
  Pass down the updated visited set when rendering children.

- [ ] **Step 4: Run build and verify build works**
  Run: `bun run build`
  Expected: PASS without compilation errors.

- [ ] **Step 5: Run E2E tests to verify regression safety**
  Run: `bunx playwright test`
  Expected: PASS.

- [ ] **Step 6: Commit**
  Run: `git commit -am "feat(web): wire view resolution and component registry with recursion safety"`
