import type { KeyboardEvent } from 'react';
import { useCallback } from 'react';

export interface NavigationNode {
  readonly id: string;
  readonly position: Readonly<{ x: number; y: number }>;
}

export interface SpatialNavigationOptions {
  readonly nodes: readonly NavigationNode[];
  readonly selectedNodeId?: string | undefined;
  readonly onSelectNode: (nodeId: string | undefined) => void;
}

export type ReactKeyboardEvent = KeyboardEvent<HTMLElement>;

function isInputElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
}

const DIRECTION_VECTORS: Readonly<Record<string, Readonly<{ x: number; y: number }>>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

export function useSpatialGraphNavigation({
  nodes,
  selectedNodeId,
  onSelectNode,
}: Readonly<SpatialNavigationOptions>): Readonly<{
  handleKeyDown: (event_: Readonly<ReactKeyboardEvent>) => void;
}> {
  const handleKeyDown = useCallback(
    (event_: Readonly<ReactKeyboardEvent>): void => {
      if (event_.defaultPrevented || isInputElement(event_.target)) {
        return;
      }

      if (event_.key === 'Escape') {
        event_.preventDefault();
        onSelectNode(undefined);
        return;
      }

      const vector = DIRECTION_VECTORS[event_.key];
      if (!vector) {
        return;
      }

      if (nodes.length === 0) {
        return;
      }

      event_.preventDefault();

      const currentNode =
        selectedNodeId === undefined ? undefined : nodes.find((node) => node.id === selectedNodeId);

      if (!currentNode) {
        const firstNode = nodes[0];
        if (firstNode) {
          onSelectNode(firstNode.id);
        }
        return;
      }

      const candidates = nodes
        .filter((node) => node.id !== currentNode.id)
        .map((node) => {
          const dx = node.position.x - currentNode.position.x;
          const dy = node.position.y - currentNode.position.y;
          const dotProduct = dx * vector.x + dy * vector.y;
          const distributionSq = dx * dx + dy * dy;
          return { node, dotProduct, distributionSq };
        })
        .filter((item) => item.dotProduct > 0)
        .toSorted((itemA, itemB) => itemA.distributionSq - itemB.distributionSq);

      const bestCandidate = candidates[0];
      if (bestCandidate) {
        onSelectNode(bestCandidate.node.id);
      }
    },
    [nodes, selectedNodeId, onSelectNode],
  );

  return { handleKeyDown };
}
