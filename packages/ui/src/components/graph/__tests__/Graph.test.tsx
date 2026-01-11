import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodeView } from '../NodeView';
import { GraphCanvas } from '../GraphCanvas';
import { Node, TextValue } from '@canopy/types';
import { asNodeId, asTypeId, createInstant } from '@canopy/types';

// Mocks
const mockNodeId = asNodeId('node-1');
const mockTypeId = asTypeId('person');
const mockTextValue: TextValue = { kind: 'text', value: 'Alice' };

const mockNode: Node = {
  id: mockNodeId,
  type: mockTypeId,
  properties: new Map([['name', mockTextValue]]),
  metadata: { created: createInstant(), modified: createInstant() },
};

const mockGraphNode = {
  ...mockNode,
  position: { x: 100, y: 100 },
};

describe('NodeView', () => {
  it('renders node type and id', () => {
    render(<NodeView node={mockNode} />);
    expect(screen.getByText('person')).toBeDefined();
    expect(screen.getByText('node-1')).toBeDefined();
  });

  it('renders properties', () => {
    render(<NodeView node={mockNode} />);
    const nameElements = screen.getAllByText('name');
    expect(nameElements.length).toBeGreaterThan(0);
    const aliceElements = screen.getAllByText('Alice');
    expect(aliceElements.length).toBeGreaterThan(0);
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    const { container } = render(<NodeView node={mockNode} onClick={onClick} />);
    // Click the main container
    fireEvent.click(container.firstChild as Element);
    expect(onClick).toHaveBeenCalledWith(mockNode);
  });
});

describe('GraphCanvas', () => {
  it('renders nodes', () => {
    render(<GraphCanvas nodes={[mockGraphNode]} edges={[]} />);
    const personElements = screen.getAllByText('person');
    expect(personElements.length).toBeGreaterThan(0);
  });

  it('handles background click', () => {
    const onBgClick = vi.fn();
    const { container } = render(
      <GraphCanvas nodes={[]} edges={[]} onBackgroundClick={onBgClick} />,
    );
    // Click the main div
    fireEvent.click(container.firstChild as Element);
    expect(onBgClick).toHaveBeenCalled();
  });
});
