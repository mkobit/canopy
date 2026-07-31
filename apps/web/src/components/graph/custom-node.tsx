import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { PropertyDisplay } from '..';
import type { Node as GraphNode, PropertyValue } from '@canopy/graph';

type CustomNodeType = Node<Readonly<{ node?: GraphNode }>>;

export const CustomNode = ({ data, selected }: NodeProps<CustomNodeType>) => {
  const node = data.node;

  if (!node) return null;

  const nameValue = node.properties.get('name') ?? node.properties.get('title');
  const nameString = typeof nameValue === 'string' ? nameValue : undefined;
  const label = nameString
    ? `Node ${node.type}: ${nameString} (ID: ${node.id.slice(0, 6)})`
    : `Node ${node.type} (ID: ${node.id.slice(0, 6)})`;

  return (
    <div
      tabIndex={0}
      role="button"
      aria-selected={selected ?? false}
      aria-label={label}
      data-node-id={node.id}
      className={`bg-white border rounded shadow-sm p-4 w-64 cursor-pointer hover:shadow-md transition-shadow select-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none ${
        selected ? 'ring-2 ring-blue-500 border-blue-500' : 'border-slate-300'
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-slate-400" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-slate-400" />

      <div className="flex justify-between items-start mb-2">
        <span className="bg-slate-100 text-slate-800 border border-slate-200 text-xs px-2 py-1 rounded font-mono font-medium">
          {node.type}
        </span>
        <span className="text-slate-600 text-[10px] font-mono" title={node.id}>
          {node.id.slice(0, 6)}
        </span>
      </div>

      <div className="space-y-2">
        {[...node.properties].map(([key, value]) => (
          <div key={key} className="text-sm">
            <div className="text-slate-700 text-xs font-semibold uppercase tracking-wider mb-0.5">
              {key}
            </div>
            <PropertyDisplay value={value as PropertyValue} />
          </div>
        ))}
      </div>
    </div>
  );
};
