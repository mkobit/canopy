import React from 'react';
import type { Node } from '@canopy/types';
import { cn } from '../../utils/cn';
import { PropertyDisplay } from '../properties/PropertyDisplay';

export interface NodeViewData {
  readonly node: Node;
  readonly className?: string;
  readonly selected?: boolean;
  readonly style?: React.CSSProperties;
}

export interface NodeViewEvents {
  readonly onClick?: (node: Node) => unknown;
}

export type NodeViewProps = NodeViewData & NodeViewEvents;

export const NodeView: React.FC<NodeViewProps> = ({
  node,
  className,
  selected,
  onClick,
  style,
}) => {
  return (
    <div
      className={cn(
        'bg-white border rounded shadow-sm p-4 w-64 cursor-pointer hover:shadow-md transition-shadow select-none',
        selected && 'ring-2 ring-blue-500',
        className,
      )}
      onClick={() => {
        onClick?.(node);
        return undefined;
      }}
      style={style}
      data-node-id={node.id}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded font-mono">
          {node.type}
        </span>
        <span className="text-gray-300 text-[10px] font-mono" title={node.id}>
          {node.id.substring(0, 6)}
        </span>
      </div>

      <div className="space-y-2">
        {Array.from(node.properties.entries()).map(([key, value]) => (
          <div key={key} className="text-sm">
            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-0.5">
              {key}
            </div>
            <PropertyDisplay value={value} />
          </div>
        ))}
      </div>
    </div>
  );
};
