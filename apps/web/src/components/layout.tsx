import React, { useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { SideNavBar, NewNodeDialog } from '.';
import { useGraph } from '../context/graph-context';
import type { PropertyValue, TypeId } from '@canopy/graph';
import { withResultAlert } from '../utils/handlers';
import { showAlert } from '../utils/dialogs';
import { listAllowedNodeTypes } from '../utils/node-types';
import { listNamespaces } from '../utils/schema';

const handleLogout = () => {
  showAlert('Logout clicked');
  return undefined;
};

export const Layout = () => {
  const { createNode, graph } = useGraph();
  const navigate = useNavigate();
  const [isNewNodeOpen, setIsNewNodeOpen] = useState(false);

  const availableTypes = useMemo(
    () => (graph ? listAllowedNodeTypes(graph, listNamespaces(graph)) : []),
    [graph],
  );

  const handleNewNode = () => {
    if (!graph) {
      showAlert('Open a graph first.');
      return undefined;
    }
    setIsNewNodeOpen(true);
    return undefined;
  };

  const handleSubmitNewNode = (type: TypeId, properties: Record<string, PropertyValue>) => {
    if (!graph) return undefined;
    return withResultAlert(
      () => createNode(type, properties),
      'Failed to create node',
      (val) => {
        setIsNewNodeOpen(false);
        navigate(`/graph/${graph.id}/node/${val}`);
      },
    )();
  };

  const handleCancelNewNode = () => {
    setIsNewNodeOpen(false);
    return undefined;
  };

  // Add the `dark` class to html/body implicitly via container, or manually update index.html.
  // Tailwind configured to expect 'dark' class. We'll set it on this main container.
  return (
    <div className="dark h-screen w-full bg-background text-on-surface font-sans overflow-hidden flex">
      <SideNavBar
        onNewNode={handleNewNode}
        onLogout={handleLogout}
        {...(graph === null ? {} : { graphId: graph.id })}
      />
      <NewNodeDialog
        open={isNewNodeOpen}
        nodeTypes={availableTypes}
        onSubmit={handleSubmitNewNode}
        onCancel={handleCancelNewNode}
      />
      <main className="flex-1 ml-64 h-full relative overflow-hidden flex flex-col bg-surface">
        <Outlet />
      </main>
    </div>
  );
};
