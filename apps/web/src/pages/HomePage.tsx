import React, { useEffect, useState } from 'react';
import { useStorage } from '../context/StorageContext';
import { useNavigate } from 'react-router-dom';
import { createGraphId } from '@canopy/types';
import { Plus, Trash2, FolderOpen } from 'lucide-react';
import type { GraphStorageMetadata } from '@canopy/storage';

export const HomePage = () => {
  const { storage, isLoading: storageLoading } = useStorage();
  const navigate = useNavigate();
  const [graphs,
setGraphs] = useState<readonly GraphStorageMetadata[]>([]);
  const [loading,
setLoading] = useState(false);

  useEffect(
() => {
    if (storage) {
      loadGraphs();
    }
    return undefined;
  },
[storage],
);

  const loadGraphs = async () => {
    if (!storage) return undefined;
    setLoading(true);

    const listResult = await storage.list();
    if (listResult.ok) {
        setGraphs(listResult.value);
    } else {
        console.error(
"Failed to list graphs",
listResult.error,
);
    }

    setLoading(false);
    return undefined;
  };

  const handleCreateGraph = async () => {
    if (!storage) return undefined;
    const name = prompt("Enter graph name:");
    if (!name) return undefined;

    const id = createGraphId();
    const now = new Date().toISOString();

    const result = await storage.save(
id,
new Uint8Array(),
{
        id,
        name,
        createdAt: now,
        updatedAt: now,
    },
);

    if (result.ok) {
        await loadGraphs();
    } else {
        console.error(
"Failed to create graph",
result.error,
);
    }
    return undefined;
  };

  const handleDeleteGraph = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!storage) return undefined;
      if (!confirm("Are you sure you want to delete this graph?")) return undefined;

      const result = await storage.delete(id);
      if (result.ok) {
          await loadGraphs();
      } else {
          console.error(
"Failed to delete graph",
result.error,
);
      }
      return undefined;
  };

  const handleOpenGraph = (id: string) => {
      // Navigate to graph route
      navigate(`/graph/${id}`);
      return undefined;
  };

  if (storageLoading || loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Your Graphs</h1>
        <button
          onClick={handleCreateGraph}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Create Graph
        </button>
      </div>

      {graphs.length === 0 ? (
        <div className="text-center p-12 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-500 mb-4">No graphs found. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {graphs.map(g => (
            <div
              key={g.id}
              onClick={() => handleOpenGraph(g.id)}
              className="group relative p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <FolderOpen size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{g.name}</h3>
                    <p className="text-sm text-gray-500 font-mono mt-1">{g.id.slice(
0,
8,
)}...</p>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteGraph(
g.id,
e,
)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
