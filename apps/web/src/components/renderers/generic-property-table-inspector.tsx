import React from 'react';
import type { Node } from '@canopy/graph';

export interface GenericPropertyTableInspectorProperties {
  readonly node: Node;
  readonly className?: string | undefined;
}

const formatPropertyValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

export const GenericPropertyTableInspector: React.FC<GenericPropertyTableInspectorProperties> = ({
  node,
  className = '',
}) => {
  const propertyEntries = [...node.properties].toSorted(([a], [b]) => a.localeCompare(b));

  return (
    <div
      data-testid="generic-property-table-inspector"
      data-node-id={node.id}
      data-node-type={node.type}
      className={`border border-gray-300 dark:border-gray-700 rounded-md p-3 bg-gray-50 dark:bg-gray-900 text-xs font-mono space-y-2 ${className}`}
    >
      <div className="flex justify-between items-center text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800 pb-1.5 font-sans">
        <span className="font-semibold text-xs tracking-wide">Property table inspector</span>
        <span className="text-[11px] text-gray-500">{node.type}</span>
      </div>
      <div className="text-[11px] text-gray-500 font-sans">
        <span className="font-medium text-gray-400">Node ID: </span>
        <span>{node.id}</span>
      </div>
      {propertyEntries.length === 0 ? (
        <div className="text-gray-400 italic py-1 font-sans">No properties</div>
      ) : (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 font-sans text-[11px]">
              <th className="py-1 pr-2 font-medium">Property</th>
              <th className="py-1 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {propertyEntries.map(([key, value]) => (
              <tr
                key={key}
                className="border-b border-gray-100 dark:border-gray-800 last:border-b-0"
              >
                <td className="py-1 pr-2 text-blue-600 dark:text-blue-400 font-semibold align-top">
                  {key}
                </td>
                <td className="py-1 text-gray-800 dark:text-gray-200 break-words align-top">
                  {formatPropertyValue(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
