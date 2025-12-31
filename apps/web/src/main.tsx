import React from 'react';
import ReactDOM from 'react-dom/client';
import { NodeView } from '@canopy/ui';
import { Node, asNodeId, asTimestamp, asTypeId } from '@canopy/types';

const App = () => {
  const node: Node = {
    id: asNodeId('502f6a9c-0c33-40f4-9029-7c15273d2218'),
    type: asTypeId('Person'),
    properties: new Map([['name', { kind: 'text', value: 'Alice' }]]),
    metadata: {
      created: asTimestamp(new Date().toISOString()),
      modified: asTimestamp(new Date().toISOString()),
    }
  };

  return (
    <div>
      <h1>PKMS Web</h1>
      <NodeView node={node} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
