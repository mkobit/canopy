import '../../../test/setup';
import { describe, it, expect, jest } from 'bun:test';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodeView } from '../node-view';
import { GraphCanvas } from '../graph-canvas';
import { Node, asDeviceId } from '@canopy/graph';
import { asNodeId, asTypeId, createInstant } from '@canopy/graph';

// Mocks
const mockNodeId = asNodeId('node-1');
const mockTypeId = asTypeId('person');
const mockTextValue = 'Alice';

const mockNode: Node = {
  id: mockNodeId,
  type: mockTypeId,
  properties: new Map([['name', mockTextValue]]),
  metadata: {
    created: createInstant(),
    modified: createInstant(),
    modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
  },
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
    const onClick = jest.fn();
    const { container } = render(<NodeView node={mockNode} onClick={onClick} />);
    // Click the main container
    if (!container.firstChild) throw new Error('container must have a child');
    fireEvent.click(container.firstChild);
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
    const onBgClick = jest.fn();
    const { container } = render(
      <GraphCanvas nodes={[]} edges={[]} onBackgroundClick={onBgClick} />,
    );
    // Click the main div
    if (!container.firstChild) throw new Error('container must have a child');
    fireEvent.click(container.firstChild);
    expect(onBgClick).toHaveBeenCalled();
  });
});
