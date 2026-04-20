import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { SideNavBar } from '@canopy/ui';
import { useGraph } from '../context/GraphContext';

const handleLogout = () => {
  alert('Logout clicked');
  return undefined;
};

export const Layout = () => {
  const { createNode, graph } = useGraph();
  const navigate = useNavigate();

  const handleNewNode = async () => {
    if (!graph) {
      alert('Open a graph first.');
      return undefined;
    }

    const text = prompt('New Node Name:');
    if (!text) return undefined;

    const result = await createNode('Note', { name: text });
    if (result.ok) {
      navigate(`/graph/${graph.id}/node/${result.value}`);
    } else {
      console.error('Failed to create node', result.error);
      alert('Failed to create node: ' + result.error.message);
    }
    return undefined;
  };

  // Add the `dark` class to html/body implicitly via container, or manually update index.html.
  // Tailwind configured to expect 'dark' class. We'll set it on this main container.
  return (
    <div className="dark h-screen w-full bg-background text-on-surface font-body overflow-hidden flex">
      <SideNavBar onNewNode={handleNewNode} onLogout={handleLogout} />
      <main className="flex-1 ml-64 h-full relative overflow-hidden flex flex-col bg-surface">
        <Outlet />
      </main>
    </div>
  );
};
