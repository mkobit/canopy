import React from 'react';
import type { Node } from '@canopy/graph';
import { cn } from '../../utils/cn';
import { PropertyDisplay } from '../properties/property-display';

export interface NodeViewData {
  readonly node: Node;
  readonly className?: string;
  readonly selected?: boolean;
  readonly style?: React.CSSProperties;
}

export interface NodeViewEvents {
  readonly onClick?: (node: Node) => unknown;
}

export type NodeViewProperties = NodeViewData & NodeViewEvents;

export const NodeView: React.FC<NodeViewProperties> = ({
  node,
  className,
  selected,
  onClick,
  style,
}) => {
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
      className={cn(
        'bg-white border border-slate-300 rounded shadow-sm p-4 w-64 cursor-pointer hover:shadow-md transition-shadow select-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none',
        selected && 'ring-2 ring-blue-500 border-blue-500',
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
            <PropertyDisplay value={value} />
          </div>
        ))}
      </div>
    </div>
  );
};
