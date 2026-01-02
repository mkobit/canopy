import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodeView } from '../NodeView.js';
import { GraphCanvas } from '../GraphCanvas.js';
import { Node, Edge, TextValue, NodeId, TypeId, EdgeId, GraphId } from '@canopy/types';
import { asNodeId, asTypeId, asEdgeId, createInstant } from '@canopy/types';

// Mocks
const mockNodeId = asNodeId('node-1');
const mockTypeId = asTypeId('person');
const mockTextValue: TextValue = { kind: 'text', value: 'Alice' };

const mockNode: Node = {
  id: mockNodeId,
  type: mockTypeId,
  properties: new Map([['name', mockTextValue]]),
  metadata: { created: createInstant(), modified: createInstant() }
};

const mockGraphNode = {
    ...mockNode,
    position: { x: 100, y: 100 }
};

const mockEdge: Edge = {
    id: asEdgeId('edge-1'),
    type: asTypeId('knows'),
    source: mockNodeId,
    target: asNodeId('node-2'),
    properties: new Map(),
    metadata: { created: createInstant(), modified: createInstant() }
};

describe('NodeView', () => {
  it('renders node type and id', () => {
    render(<NodeView node={mockNode} />);
    expect(screen.getByText('person')).toBeDefined();
    expect(screen.getByText('node-1')).toBeDefined();
  });

  it('renders properties', () => {
    render(<NodeView node={mockNode} />);
    expect(screen.getByText('name')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<NodeView node={mockNode} onClick={onClick} />);
    fireEvent.click(screen.getByText('person'));
    expect(onClick).toHaveBeenCalledWith(mockNode);
  });
});

describe('GraphCanvas', () => {
  it('renders nodes', () => {
    render(<GraphCanvas nodes={[mockGraphNode]} edges={[]} />);
    expect(screen.getByText('person')).toBeDefined();
  });

  it('handles background click', () => {
    const onBgClick = vi.fn();
    const { container } = render(<GraphCanvas nodes={[]} edges={[]} onBackgroundClick={onBgClick} />);
    // Click the main div
    fireEvent.click(container.firstChild as Element);
    expect(onBgClick).toHaveBeenCalled();
  });
});
