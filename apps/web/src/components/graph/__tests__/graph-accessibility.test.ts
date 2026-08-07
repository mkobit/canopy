import { describe, it, expect, mock, afterEach } from 'bun:test';
import { renderHook, act, render, cleanup } from '@testing-library/react';
import React from 'react';
import { AriaLiveRegion, useAriaLiveAnnouncer } from '../aria-live-region';
import { NodeView } from '../node-view';
import { GraphCanvas } from '../graph-canvas';
import type { Node } from '@canopy/graph';
import { asNodeId, asTypeId, asDeviceId, createInstant } from '@canopy/graph';
import { ReactFlowProvider } from '@xyflow/react';

// @testing-library/react's auto-cleanup only self-registers under Jest/Vitest globals, which Bun's
// test runner doesn't provide, so `render()` output (including nested `AriaLiveRegion` instances,
// which all share `data-testid="aria-live-region"`) persists in the shared happy-dom `document`
// across `it()` blocks in this file unless torn down explicitly. Matches the convention already
// used in block-editor.test.tsx, new-node-dialog.test.tsx, and command-palette.test.tsx.
afterEach(() => {
  cleanup();
});

const captured = {
  reactFlowProperties: undefined as Readonly<Record<string, unknown>> | undefined,
};

mock.module('@xyflow/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actual = require('@xyflow/react');
  return {
    ...actual,
    ReactFlow: (
      properties: Readonly<Record<string, unknown>> & { readonly children?: React.ReactNode },
    ) => {
      captured.reactFlowProperties = properties;
      return React.createElement('div', { 'data-testid': 'react-flow-mock' }, properties.children);
    },
  };
});

mock.module('../../context/graph-context', () => ({
  useGraph: () => ({
    graph: { nodes: new Map(), edges: new Map() },
    createNode: mock(async () => ({ ok: true })),
    createEdge: mock(async () => ({ ok: true })),
  }),
}));

mock.module('react-router-dom', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actual = require('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mock(() => undefined),
    useParams: () => ({ graphId: 'g1' }),
  };
});

import { InteractiveGraphView } from '../interactive-graph-view';

const mockNode: Node = {
  id: asNodeId('n12345'),
  type: asTypeId('Note'),
  properties: new Map([['name', 'Project Alpha']]),
  metadata: {
    created: createInstant(),
    modified: createInstant(),
    modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
  },
};

describe('Graph WCAG 2.1 AA Accessibility', () => {
  describe('AriaLiveRegion and useAriaLiveAnnouncer', () => {
    it('renders aria-live region with role status and polite announcements', () => {
      const { getByTestId } = render(
        React.createElement(AriaLiveRegion, { message: 'Node selected' }),
      );
      const liveRegion = getByTestId('aria-live-region');
      expect(liveRegion.getAttribute('role')).toBe('status');
      expect(liveRegion.getAttribute('aria-live')).toBe('polite');
      expect(liveRegion.getAttribute('aria-atomic')).toBe('true');
      expect(liveRegion.textContent).toBe('Node selected');
    });

    it('updates announcement message via useAriaLiveAnnouncer hook', () => {
      const { result } = renderHook(() => useAriaLiveAnnouncer());
      expect(result.current.announcement).toBe('');

      act(() => {
        result.current.announce('Node note-1 created');
      });

      expect(result.current.announcement).toBe('Node note-1 created');
    });
  });

  describe('NodeView ARIA Attributes & Contrast Styling', () => {
    it('renders node with role button, aria-selected, and dynamic aria-label', () => {
      const { container } = render(
        React.createElement(NodeView, {
          node: mockNode,
          selected: true,
        }),
      );

      const nodeDiv = container.querySelector('[data-node-id="n12345"]');
      expect(nodeDiv).not.toBeNull();
      expect(nodeDiv?.getAttribute('role')).toBe('button');
      expect(nodeDiv?.getAttribute('aria-selected')).toBe('true');
      expect(nodeDiv?.getAttribute('aria-label')).toBe('Node Note: Project Alpha (ID: n12345)');
    });

    it('uses high-contrast slate colors for WCAG 2.1 AA compliance', () => {
      const { container } = render(
        React.createElement(NodeView, {
          node: mockNode,
          selected: false,
        }),
      );

      const badge = container.querySelector('span.bg-slate-100');
      expect(badge).not.toBeNull();
      expect(badge?.className).toContain('text-slate-800');

      const idSpan = container.querySelector('span.text-slate-600');
      expect(idSpan).not.toBeNull();
    });
  });

  describe('GraphCanvas ARIA Container & Announcements', () => {
    it('renders canvas container with role region and aria-label', () => {
      const { container } = render(
        React.createElement(GraphCanvas, {
          nodes: [{ ...mockNode, position: { x: 10, y: 10 } }],
          edges: [],
        }),
      );

      const canvasContainer = container.querySelector('div[role="region"]');
      expect(canvasContainer).not.toBeNull();
      expect(canvasContainer?.getAttribute('aria-label')).toBe('Graph visualization canvas');
    });
  });

  describe('InteractiveGraphView Performance & Viewport Culling', () => {
    it('verifies onlyRenderVisibleElements prop setting on ReactFlow', () => {
      render(
        React.createElement(ReactFlowProvider, null, React.createElement(InteractiveGraphView)),
      );
      expect(captured.reactFlowProperties?.onlyRenderVisibleElements).toBe(true);
    });
  });
});
