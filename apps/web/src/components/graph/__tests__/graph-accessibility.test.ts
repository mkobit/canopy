import { describe, it, expect } from 'bun:test';
import { renderHook, act, render } from '@testing-library/react';
import React from 'react';
import { AriaLiveRegion, useAriaLiveAnnouncer } from '../aria-live-region';
import { NodeView } from '../node-view';
import { GraphCanvas } from '../graph-canvas';
import type { Node } from '@canopy/graph';
import { asNodeId, asTypeId, asDeviceId, createInstant } from '@canopy/graph';

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
});
