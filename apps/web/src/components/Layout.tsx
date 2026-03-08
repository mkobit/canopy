import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, Search, PlusCircle, Settings, Table2, List, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useGraph } from '../context/GraphContext';
import { SYSTEM_IDS } from '@canopy/core';

const SYSTEM_VIEWS = [
  { id: SYSTEM_IDS.VIEW_ALL_NODES, icon: Table2, fallbackName: 'All Nodes' },
  { id: SYSTEM_IDS.VIEW_BY_TYPE, icon: List, fallbackName: 'By Type' },
  { id: SYSTEM_IDS.VIEW_RECENT, icon: Clock, fallbackName: 'Recent' },
] as const;

const Sidebar = ({ onQuickCapture }: Readonly<{ onQuickCapture: () => unknown }>) => {
  const { graph } = useGraph();

  return (
    <div className="w-64 h-screen bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-800">Canopy</h1>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <NavLink
          to="/"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 text-gray-700',
              isActive && 'bg-gray-200 font-medium',
            )
          }
        >
          <Home size={20} />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/search"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 text-gray-700',
              isActive && 'bg-gray-200 font-medium',
            )
          }
        >
          <Search size={20} />
          <span>Search</span>
        </NavLink>

        {/* Quick Capture Placeholder - could be a modal trigger instead of a route */}
        <button
          onClick={onQuickCapture}
          className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 text-gray-700 text-left"
        >
          <PlusCircle size={20} />
          <span>Quick Capture</span>
        </button>

        {graph && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
              Views
            </h3>
            {SYSTEM_VIEWS.map(({ id, icon: Icon, fallbackName }) => {
              const viewNode = graph.nodes.get(id);
              const name =
                typeof viewNode?.properties.get('name') === 'string'
                  ? (viewNode.properties.get('name') as string)
                  : fallbackName;
              return (
                <NavLink
                  key={id}
                  to={`/graph/${graph.id}/view/${id}`}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 text-gray-700',
                      isActive && 'bg-gray-200 font-medium',
                    )
                  }
                >
                  <Icon size={20} />
                  <span>{name}</span>
                </NavLink>
              );
            })}
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <button className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
};

export const Layout = () => {
  const { createNode, graph } = useGraph();
  const navigate = useNavigate();

  const handleQuickCapture = async () => {
    if (!graph) {
      alert('Open a graph first.');
      return undefined;
    }

    const text = prompt('Quick Note:');
    if (!text) return undefined;

    // eslint-disable-next-line functional/no-try-statements
    try {
      const result = await createNode('Note', { name: text });
      if (result.ok) {
        navigate(`/graph/${graph.id}/node/${result.value}`);
      } else {
        console.error('Failed to create node', result.error);
        alert('Failed to create node: ' + result.error.message);
      }
    } catch (error) {
      console.error('Failed to create node', error);
      alert('Failed to create node.');
    }
    return undefined;
  };

  return (
    <div className="flex h-screen w-full bg-white">
      <Sidebar onQuickCapture={handleQuickCapture} />
      <main className="flex-1 h-full overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
};
