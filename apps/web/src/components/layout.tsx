import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { SideNavBar } from '.';
import { useGraph } from '../context/graph-context';
import { SYSTEM_IDS } from '@canopy/graph';
import { withResultAlert } from '../utils/handlers';
import { showAlert, showPrompt } from '../utils/dialogs';

const handleLogout = () => {
  showAlert('Logout clicked');
  return undefined;
};

export const Layout = () => {
  const { createNode, graph } = useGraph();
  const navigate = useNavigate();

  const handleNewNode = async () => {
    if (!graph) {
      showAlert('Open a graph first.');
      return undefined;
    }

    const text = showPrompt('New Node Name:');
    if (!text) return undefined;

    return withResultAlert(
      () => createNode(SYSTEM_IDS.TYPE_MARKDOWN, { name: text }),
      'Failed to create node',
      (val) => navigate(`/graph/${graph.id}/node/${val}`),
    )();
  };

  // Add the `dark` class to html/body implicitly via container, or manually update index.html.
  // Tailwind configured to expect 'dark' class. We'll set it on this main container.
  return (
    <div className="dark h-screen w-full bg-background text-on-surface font-body overflow-hidden flex">
      <SideNavBar
        onNewNode={handleNewNode}
        onLogout={handleLogout}
        {...(graph === null ? {} : { graphId: graph.id })}
      />
      <main className="flex-1 ml-64 h-full relative overflow-hidden flex flex-col bg-surface">
        <Outlet />
      </main>
    </div>
  );
};
