import React from 'react';
import ReactDOM from 'react-dom/client';
import { NodeView } from '@canopy/ui';
import { Node } from '@canopy/schema';

const App = () => {
  const node: Node = {
    id: '123',
    labels: ['Person'],
    properties: { name: 'Alice' },
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
