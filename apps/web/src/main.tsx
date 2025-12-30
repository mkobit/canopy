import React from 'react';
import ReactDOM from 'react-dom/client';
import { NodeView } from '@canopy/ui';
import { Node } from '@canopy/schema';

const App = () => {
  const node: Node = {
    id: '502f6a9c-0c33-40f4-9029-7c15273d2218',
    type: 'Person',
    properties: { name: 'Alice' },
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
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
