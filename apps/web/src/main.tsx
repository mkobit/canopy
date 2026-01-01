import React from 'react';
import ReactDOM from 'react-dom/client';
import { NodeView } from '@canopy/ui';
import { Node, NodeId, Instant, TypeId } from '@canopy/types';

const App = () => {
  const now = new Date().toISOString() as Instant;
  const node: Node = {
    id: '502f6a9c-0c33-40f4-9029-7c15273d2218' as NodeId,
    type: 'Person' as TypeId,
    properties: new Map([['name', { kind: 'text', value: 'Alice' }]]),
    metadata: {
      created: now,
      modified: now,
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
