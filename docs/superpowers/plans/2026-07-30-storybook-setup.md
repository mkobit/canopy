# Storybook Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure Storybook 8 in `apps/web` for isolated visual component testing of graph and UI components.

**Architecture:** Scopes Storybook 8 using `@storybook/react-vite` to `apps/web`, inheriting existing Vite 8 configuration, PostCSS Tailwind CSS v4 styling, font imports, and path shims while executing via Bun.

**Tech Stack:** React 19, `@storybook/react-vite`, `@storybook/addon-essentials`, Vite 8, Tailwind CSS v4, Bun, `@xyflow/react`.

## Global Constraints

- Use `bun` as the single package manager and runner.
- All file and component modifications must adhere to `eslint-plugin-functional` immutability rules (`readonly` types, no mutation).
- Sentence case for commit messages and headings.
- Run quality gates (`bun run build && bun run lint && bun run typecheck && bun test`) before completion.

---

### Task 1: Configure Storybook dependencies and package scripts

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: None
- Produces: `"storybook"` and `"build-storybook"` scripts in `apps/web/package.json` and root `package.json`.

- [ ] **Step 1: Add Storybook devDependencies to `apps/web/package.json`**

Edit `apps/web/package.json` to include Storybook packages under `devDependencies`:
```json
  "devDependencies": {
    "@storybook/addon-essentials": "^8.6.14",
    "@storybook/react": "^8.6.14",
    "@storybook/react-vite": "^8.6.14",
    "storybook": "^8.6.14"
  }
```

- [ ] **Step 2: Add Storybook scripts to `apps/web/package.json` and root `package.json`**

In `apps/web/package.json`:
```json
  "scripts": {
    "storybook": "STORYBOOK_DISABLE_TELEMETRY=1 storybook dev -p 6006 --host 127.0.0.1",
    "build-storybook": "STORYBOOK_DISABLE_TELEMETRY=1 storybook build -o .storybook-static"
  }
```

In root `package.json`:
```json
  "scripts": {
    "storybook": "bun --filter '@canopy/web' storybook",
    "build-storybook": "bun --filter '@canopy/web' build-storybook"
  }
```

- [ ] **Step 3: Run `bun install` to lock dependencies**

Run: `bun install`
Expected: Dependencies resolve and update `bun.lock`.

- [ ] **Step 4: Commit dependency configuration**

```bash
git add apps/web/package.json package.json bun.lock
git commit -m "build: add storybook dependencies and scripts to apps/web"
```

---

### Task 2: Create Storybook configuration in `apps/web/.storybook/`

**Files:**
- Create: `apps/web/.storybook/main.ts`
- Create: `apps/web/.storybook/preview.tsx`
- Modify: `.gitignore`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: `apps/web/vite.config.ts`, `apps/web/src/index.css`
- Produces: `.storybook/main.ts` and `.storybook/preview.tsx` for Storybook dev server and static build.

- [ ] **Step 1: Create `apps/web/.storybook/main.ts`**

```typescript
import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (viteConfig) => {
    return {
      ...viteConfig,
      resolve: {
        ...viteConfig.resolve,
        alias: {
          ...viteConfig.resolve?.alias,
          'canopy:graph/draft-session': fileURLToPath(
            new URL('../src/plugin/draft-session-shim.ts', import.meta.url),
          ),
        },
      },
    };
  },
};

export default config;
```

- [ ] **Step 2: Create `apps/web/.storybook/preview.tsx`**

```typescript
import type { Preview } from '@storybook/react';
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@fontsource/inter';
import '@fontsource/jetbrains-mono';
import '@fontsource/space-grotesk';
import '@xyflow/react/dist/style.css';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <div className="w-full h-96 p-4 bg-slate-900 text-slate-100 font-sans">
          <Story />
        </div>
      </ReactFlowProvider>
    ),
  ],
};

export default preview;
```

- [ ] **Step 3: Update `.gitignore` and `eslint.config.mjs` to ignore `.storybook-static`**

In `.gitignore`:
```
.storybook-static
```

In `eslint.config.mjs`:
Add `**/apps/web/.storybook-static/**` to `ignores`.

- [ ] **Step 4: Commit Storybook configuration**

```bash
git add apps/web/.storybook/ .gitignore eslint.config.mjs
git commit -m "feat: configure storybook in apps/web"
```

---

### Task 3: Create stories for core Graph canvas and node components

**Files:**
- Create: `apps/web/src/components/graph/custom-node.stories.tsx`
- Create: `apps/web/src/components/graph/custom-edge.stories.tsx`
- Create: `apps/web/src/components/graph/graph-canvas.stories.tsx`

**Interfaces:**
- Consumes: `CustomNode`, `CustomEdge`, `GraphCanvas` from `apps/web/src/components/graph/`
- Produces: Storybook story modules for visual testing of graph components.

- [ ] **Step 1: Create `apps/web/src/components/graph/custom-node.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ReactFlow, type NodeProps } from '@xyflow/react';
import { CustomNode } from './custom-node';

const meta: Meta<typeof CustomNode> = {
  title: 'Graph/CustomNode',
  component: CustomNode,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CustomNode>;

const renderWithCanvas = (props: NodeProps) => (
  <div className="w-[300px] h-[200px] bg-slate-950 rounded-lg p-4">
    <ReactFlow
      nodes={[{ id: props.id, type: 'custom', position: { x: 50, y: 50 }, data: props.data }]}
      nodeTypes={{ custom: CustomNode }}
      fitView
    />
  </div>
);

export const Default: Story = {
  render: () =>
    renderWithCanvas({
      id: 'node-1',
      data: { label: 'Default Node', nodeType: 'concept' },
      selected: false,
      type: 'custom',
      zIndex: 1,
      isConnectable: true,
      xPos: 0,
      yPos: 0,
      dragging: false,
    }),
};

export const Selected: Story = {
  render: () =>
    renderWithCanvas({
      id: 'node-2',
      data: { label: 'Selected Node', nodeType: 'action' },
      selected: true,
      type: 'custom',
      zIndex: 1,
      isConnectable: true,
      xPos: 0,
      yPos: 0,
      dragging: false,
    }),
};
```

- [ ] **Step 2: Create `apps/web/src/components/graph/custom-edge.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ReactFlow, Position, type EdgeProps } from '@xyflow/react';
import { CustomEdge } from './custom-edge';
import { CustomNode } from './custom-node';

const meta: Meta<typeof CustomEdge> = {
  title: 'Graph/CustomEdge',
  component: CustomEdge,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CustomEdge>;

const renderEdgeCanvas = (props: EdgeProps) => (
  <div className="w-[400px] h-[250px] bg-slate-950 rounded-lg p-4">
    <ReactFlow
      nodes={[
        { id: '1', type: 'custom', position: { x: 20, y: 80 }, data: { label: 'Source' } },
        { id: '2', type: 'custom', position: { x: 250, y: 80 }, data: { label: 'Target' } },
      ]}
      edges={[{ ...props, id: 'e1-2', source: '1', target: '2', type: 'custom' }]}
      nodeTypes={{ custom: CustomNode }}
      edgeTypes={{ custom: CustomEdge }}
      fitView
    />
  </div>
);

export const Default: Story = {
  render: () =>
    renderEdgeCanvas({
      id: 'e1-2',
      source: '1',
      target: '2',
      sourceX: 100,
      sourceY: 100,
      targetX: 300,
      targetY: 100,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      selected: false,
      data: { label: 'depends_on' },
    }),
};
```

- [ ] **Step 3: Create `apps/web/src/components/graph/graph-canvas.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { GraphCanvas } from './graph-canvas';

const meta: Meta<typeof GraphCanvas> = {
  title: 'Graph/GraphCanvas',
  component: GraphCanvas,
};

export default meta;
type Story = StoryObj<typeof GraphCanvas>;

export const SampleGraph: Story = {
  render: () => (
    <div className="w-[800px] h-[500px] border border-slate-700 rounded-lg overflow-hidden">
      <GraphCanvas
        initialNodes={[
          { id: '1', type: 'customNode', position: { x: 100, y: 100 }, data: { label: 'Knowledge Graph' } },
          { id: '2', type: 'customNode', position: { x: 400, y: 200 }, data: { label: 'Storybook Component' } },
        ]}
        initialEdges={[
          { id: 'e1-2', source: '1', target: '2', label: 'renders' },
        ]}
      />
    </div>
  ),
};
```

- [ ] **Step 4: Commit component stories**

```bash
git add apps/web/src/components/graph/*.stories.tsx
git commit -m "feat: add storybook stories for graph canvas and node components"
```

---

### Task 4: Validate Storybook build and runtime execution

**Files:**
- None (verification task)

- [ ] **Step 1: Run static Storybook build**

Run: `bun run build-storybook`
Expected: Static build completes cleanly without errors and generates `.storybook-static/`.

- [ ] **Step 2: Clean up static build output directory**

Run: `rm -rf apps/web/.storybook-static`

---

### Task 5: Execute quality gates

**Files:**
- None (verification task)

- [ ] **Step 1: Run build, lint, typecheck, and unit tests**

Run: `bun run build && bun run lint && bun run typecheck && bun test`
Expected: All build steps, linters, type checks, and tests pass cleanly.

- [ ] **Step 2: Update bead status**

Run: `bd close canopy-gtv.1`
Expected: `canopy-gtv.1` closed.
