import React from 'react';
import type { Node } from '@canopy/types';
import { reduce } from 'remeda';

export interface ListLayoutData {
  readonly nodes: readonly Node[];
  readonly groupBy?: string;
}

export interface ListLayoutEvents {
  readonly onNodeClick: (node: Node) => unknown;
}

export type ListLayoutProps = ListLayoutData & ListLayoutEvents;

function groupNodes(nodes: readonly Node[], groupBy: string): readonly [string, readonly Node[]][] {
  const getKey = (node: Node): string =>
    groupBy === 'type'
      ? node.type
      : (() => {
          const val = node.properties.get(groupBy);
          return typeof val === 'string' ? val : 'Ungrouped';
        })();

  const groups = reduce(
    nodes,
    (acc: ReadonlyMap<string, readonly Node[]>, node) => {
      const key = getKey(node);
      const existing = acc.get(key) ?? [];
      return new Map([...acc, [key, [...existing, node]]]);
    },
    new Map(),
  );

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const NodeListItem = ({
  node,
  onClick,
}: Readonly<{
  node: Node;
  onClick: (node: Node) => unknown;
}>) => {
  const name = (() => {
    const n = node.properties.get('name');
    return typeof n === 'string' ? n : `${node.id.slice(0, 8)}…`;
  })();

  return (
    <div
      onClick={() => {
        onClick(node);
        return undefined;
      }}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
    >
      <span className="font-mono text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">
        {node.type}
      </span>
      <span className="text-gray-800 text-sm truncate">{name}</span>
    </div>
  );
};

export const ListLayout: React.FC<ListLayoutProps> = ({ nodes, groupBy, onNodeClick }) => {
  if (nodes.length === 0) {
    return <div className="p-8 text-center text-gray-500">No nodes found.</div>;
  }

  if (!groupBy) {
    return (
      <div>
        {nodes.map((node) => (
          <NodeListItem key={node.id} node={node} onClick={onNodeClick} />
        ))}
      </div>
    );
  }

  const groups = groupNodes(nodes, groupBy);

  return (
    <div>
      {groups.map(([groupKey, groupedNodes]) => (
        <div key={groupKey} className="mb-2">
          <div className="px-4 py-2 bg-gray-50 border-y border-gray-200 sticky top-0">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {groupKey}
            </h3>
          </div>
          {groupedNodes.map((node) => (
            <NodeListItem key={node.id} node={node} onClick={onNodeClick} />
          ))}
        </div>
      ))}
    </div>
  );
};
