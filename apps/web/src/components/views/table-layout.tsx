import React from 'react';
import type { Node } from '@canopy/types';
import { PropertyDisplay } from '../properties/property-display';

export interface TableLayoutData {
  readonly nodes: readonly Node[];
  readonly displayProperties?: readonly string[];
}

export interface TableLayoutEvents {
  readonly onNodeClick: (node: Node) => unknown;
}

export type TableLayoutProps = TableLayoutData & TableLayoutEvents;

export const TableLayout: React.FC<TableLayoutProps> = ({
  nodes,
  displayProperties,
  onNodeClick,
}) => {
  const columns =
    displayProperties && displayProperties.length > 0 ? displayProperties : ['name', 'description'];

  if (nodes.length === 0) {
    return <div className="p-8 text-center text-gray-500">No nodes found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600 text-xs uppercase tracking-wider">
              Type
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left font-medium text-gray-600 text-xs uppercase tracking-wider"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr
              key={node.id}
              onClick={() => {
                onNodeClick(node);
                return undefined;
              }}
              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
            >
              <td className="px-4 py-3">
                <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                  {node.type}
                </span>
              </td>
              {columns.map((col) => (
                <td key={col} className="px-4 py-3 text-gray-700">
                  {node.properties.has(col) ? (
                    <PropertyDisplay value={node.properties.get(col)!} />
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
