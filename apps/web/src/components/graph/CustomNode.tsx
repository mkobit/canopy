import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { PropertyDisplay } from '@canopy/ui';
import type { Node as GraphNode, PropertyValue } from '@canopy/types';

export const CustomNode = ({ data, selected }: NodeProps) => {
  const node = data.node as GraphNode | undefined;

  if (!node) return null;

  return (
    <div
      className={`bg-white border rounded shadow-sm p-4 w-64 cursor-pointer hover:shadow-md transition-shadow select-none ${
        selected ? 'ring-2 ring-blue-500' : 'border-gray-200'
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-gray-400" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-gray-400" />

      <div className="flex justify-between items-start mb-2">
        <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded font-mono">
          {node.type}
        </span>
        <span className="text-gray-400 text-[10px] font-mono" title={node.id}>
          {node.id.slice(0, 6)}
        </span>
      </div>

      <div className="space-y-2">
        {[...node.properties.entries()].map(([key, value]) => (
          <div key={key} className="text-sm">
            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-0.5">
              {key}
            </div>
            <PropertyDisplay value={value as PropertyValue} />
          </div>
        ))}
      </div>
    </div>
  );
};
