import React from 'react';
import { Node } from '@canopy/schema';

export const NodeView: React.FC<{ node: Node }> = ({ node }) => {
  return (
    <div className="node">
      <h3>{node.id}</h3>
      <ul>
        {node.labels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </div>
  );
};
