import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, Search, PlusCircle, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { useGraph } from '../context/GraphContext';

const Sidebar = ({ onQuickCapture }: { readonly onQuickCapture: () => void }) => {
  return (
    <div className="w-64 h-screen bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-800">Canopy</h1>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <NavLink
          to="/"
          className={({ isActive }) =>
            clsx("flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 text-gray-700", isActive && "bg-gray-200 font-medium")
          }
        >
          <Home size={20} />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/search"
          className={({ isActive }) =>
            clsx("flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 text-gray-700", isActive && "bg-gray-200 font-medium")
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
          alert("Open a graph first.");
          return;
      }

      const text = prompt("Quick Note:");
      if (!text) return;

      try {
          const nodeId = await createNode('Note', { name: text });
          if (nodeId) {
              navigate(`/graph/${graph.id}/node/${nodeId}`);
          }
      } catch (e) {
          console.error("Failed to create node", e);
          alert("Failed to create node.");
      }
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
