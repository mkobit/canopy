import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ReactFlow, Position } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { CustomEdge } from './custom-edge';
import { CustomNode } from './custom-node';
import { asDeviceId, asInstant, asNodeId, asTypeId } from '@canopy/graph';

const meta: Meta<typeof CustomEdge> = {
  title: 'Graph/CustomEdge',
  component: CustomEdge,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CustomEdge>;

const sourceNode = {
  id: asNodeId('node-1'),
  type: asTypeId('concept'),
  properties: new Map([['title', 'Source']]),
  metadata: {
    created: asInstant('2025-01-01T00:00:00Z'),
    modified: asInstant('2025-01-01T00:00:00Z'),
    modifiedBy: asDeviceId('dev-1'),
  },
};

const targetNode = {
  id: asNodeId('node-2'),
  type: asTypeId('concept'),
  properties: new Map([['title', 'Target']]),
  metadata: {
    created: asInstant('2025-01-01T00:00:00Z'),
    modified: asInstant('2025-01-01T00:00:00Z'),
    modifiedBy: asDeviceId('dev-1'),
  },
};

const renderEdgeCanvas = (edgeProperties: Readonly<EdgeProps>) => (
  <div className="w-[400px] h-[250px] bg-slate-950 rounded-lg p-4">
    <ReactFlow
      nodes={[
        {
          id: '1',
          type: 'custom',
          position: { x: 20, y: 80 },
          data: { label: 'Source', node: sourceNode },
        },
        {
          id: '2',
          type: 'custom',
          position: { x: 250, y: 80 },
          data: { label: 'Target', node: targetNode },
        },
      ]}
      edges={[{ ...edgeProperties, id: 'e1-2', source: '1', target: '2', type: 'custom' }]}
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
