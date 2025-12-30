import React from 'react';
import { Node } from '@canopy/schema';

export const NodeView: React.FC<{ node: Node }> = ({ node }) => {
  return (
    <div className="node">
      <h3>{node.id}</h3>
      <p>Type: {node.type}</p>
      <ul>
        {Object.entries(node.properties).map(([key, value]) => (
          <li key={key}>{key}: {String(value)}</li>
        ))}
      </ul>
    </div>
  );
};
