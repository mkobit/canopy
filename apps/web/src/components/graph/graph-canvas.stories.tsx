import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { GraphCanvas } from './graph-canvas';
import { asDeviceId, asEdgeId, asInstant, asNodeId, asTypeId } from '@canopy/graph';

const meta: Meta<typeof GraphCanvas> = {
  title: 'Graph/GraphCanvas',
  component: GraphCanvas,
};

export default meta;
type Story = StoryObj<typeof GraphCanvas>;

const sampleNode1 = {
  id: asNodeId('1'),
  type: asTypeId('customNode'),
  properties: new Map([['title', 'Knowledge Graph']]),
  metadata: {
    created: asInstant('2025-01-01T00:00:00Z'),
    modified: asInstant('2025-01-01T00:00:00Z'),
    modifiedBy: asDeviceId('dev-1'),
  },
  position: { x: 100, y: 100 },
};

const sampleNode2 = {
  id: asNodeId('2'),
  type: asTypeId('customNode'),
  properties: new Map([['title', 'Storybook Component']]),
  metadata: {
    created: asInstant('2025-01-01T00:00:00Z'),
    modified: asInstant('2025-01-01T00:00:00Z'),
    modifiedBy: asDeviceId('dev-1'),
  },
  position: { x: 400, y: 200 },
};

const sampleEdge = {
  id: asEdgeId('e1-2'),
  type: asTypeId('renders'),
  source: sampleNode1.id,
  target: sampleNode2.id,
  properties: new Map(),
  metadata: {
    created: asInstant('2025-01-01T00:00:00Z'),
    modified: asInstant('2025-01-01T00:00:00Z'),
    modifiedBy: asDeviceId('dev-1'),
  },
};

export const SampleGraph: Story = {
  render: () => (
    <div className="w-[800px] h-[500px] border border-slate-700 rounded-lg overflow-hidden">
      <GraphCanvas nodes={[sampleNode1, sampleNode2]} edges={[sampleEdge]} />
    </div>
  ),
};
