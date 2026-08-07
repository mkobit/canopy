import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { CustomNode } from './custom-node';
import { asDeviceId, asInstant, asNodeId, asTypeId } from '@canopy/graph';

const meta: Meta<typeof CustomNode> = {
  title: 'Graph/CustomNode',
  component: CustomNode,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CustomNode>;

const defaultNode = {
  id: asNodeId('node-1'),
  type: asTypeId('concept'),
  properties: new Map([['title', 'Default Node']]),
  metadata: {
    created: asInstant('2025-01-01T00:00:00Z'),
    modified: asInstant('2025-01-01T00:00:00Z'),
    modifiedBy: asDeviceId('dev-1'),
  },
};

const selectedNode = {
  id: asNodeId('node-2'),
  type: asTypeId('action'),
  properties: new Map([['title', 'Selected Node']]),
  metadata: {
    created: asInstant('2025-01-01T00:00:00Z'),
    modified: asInstant('2025-01-01T00:00:00Z'),
    modifiedBy: asDeviceId('dev-1'),
  },
};

const renderWithCanvas = (nodeProperties: Readonly<NodeProps>) => (
  <div className="w-[300px] h-[200px] bg-slate-950 rounded-lg p-4">
    <ReactFlow
      nodes={[
        {
          id: nodeProperties.id,
          type: 'custom',
          position: { x: 50, y: 50 },
          data: nodeProperties.data,
        },
      ]}
      nodeTypes={{ custom: CustomNode }}
      fitView
    />
  </div>
);

export const Default: Story = {
  render: () =>
    renderWithCanvas({
      id: 'node-1',
      data: { label: 'Default Node', nodeType: 'concept', node: defaultNode },
      selected: false,
      type: 'custom',
      zIndex: 1,
      isConnectable: true,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: true,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
    }),
};

export const Selected: Story = {
  render: () =>
    renderWithCanvas({
      id: 'node-2',
      data: { label: 'Selected Node', nodeType: 'action', node: selectedNode },
      selected: true,
      type: 'custom',
      zIndex: 1,
      isConnectable: true,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: true,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
    }),
};
