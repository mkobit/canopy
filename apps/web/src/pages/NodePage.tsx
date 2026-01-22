import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGraph } from '../context/GraphContext';
import { NodeView, PropertyInput } from '@canopy/ui';
import type { Node, NodeId, PropertyValue } from '@canopy/types';
import { ArrowLeft, Save, Trash, Link as LinkIcon } from 'lucide-react';
import { filter, map } from 'remeda';

export const NodePage = () => {
  const { nodeId } = useParams<Readonly<{ nodeId: string }>>();
  const { graph, syncEngine, saveGraph } = useGraph();
  const navigate = useNavigate();
  const [currentNode, setCurrentNode] = useState<Node | undefined>();
  const [isEditing, setIsEditing] = useState(false);
  const [editedProps, setEditedProps] = useState<ReadonlyMap<string, PropertyValue>>(new Map());

  // Subscribe/Fetch node from graph
  useEffect(() => {
    if (graph && nodeId) {
      const node = graph.nodes.get(nodeId as NodeId);
      setCurrentNode(node);
      if (node) {
        setEditedProps(new Map(node.properties));
      }
    }
    return undefined;
  }, [graph, nodeId]);

  if (!currentNode) {
    return (
      <div className="p-8 text-center">
        <p>Node not found</p>
        <button onClick={() => navigate('..')} className="mt-4 text-blue-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const handleSave = async () => {
    if (!syncEngine || !currentNode) return undefined;

    // eslint-disable-next-line functional/no-try-statements
    try {
      syncEngine.store.updateNode(currentNode.id, {
        properties: new Map(editedProps),
      });

      await saveGraph(); // Persist changes
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save node', error);
      alert('Failed to save changes');
    }
    return undefined;
  };

  const handlePropertyChange = (key: string, value: PropertyValue) => {
    setEditedProps((prev) => {
      const next = new Map(prev);
      // eslint-disable-next-line functional/immutable-data
      next.set(key, value);
      return next;
    });
    return undefined;
  };

  const handleDelete = async () => {
    if (!syncEngine || !currentNode) return undefined;
    if (!confirm('Delete this node?')) return undefined;

    // eslint-disable-next-line functional/no-try-statements
    try {
      syncEngine.store.deleteNode(currentNode.id);
      await saveGraph();
      navigate('../'); // Go up to graph view
    } catch (error) {
      console.error('Delete failed', error);
    }
    return undefined;
  };

  // Find connected edges
  const connectedEdges = useMemo(() => {
    if (!graph || !currentNode) return [];

    return filter(
      [...graph.edges.values()],
      (edge) => edge.source === currentNode.id || edge.target === currentNode.id,
    );
  }, [graph, currentNode]);

  return (
    <div className="max-w-3xl mx-auto bg-white min-h-full shadow-sm border-x border-gray-100 flex flex-col">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white/80 backdrop-blur-md z-10">
        <button
          onClick={() => navigate('../')}
          className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => {
                  setIsEditing(false);
                  return undefined;
                }}
                className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Save size={16} /> Save
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDelete}
                className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-md"
              >
                <Trash size={18} />
              </button>
              <button
                onClick={() => {
                  setIsEditing(true);
                  return undefined;
                }}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-8 flex-1">
        {isEditing ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500">Node Type</label>
              <div className="text-lg font-mono text-gray-800 bg-gray-50 p-2 rounded border">
                {currentNode.type}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Properties</h3>
              {map([...editedProps.entries()], ([key, val]: readonly [string, PropertyValue]) => (
                <div key={key} className="space-y-1">
                  <label className="text-sm text-gray-600">{key}</label>
                  <PropertyInput
                    value={val}
                    onChange={(newVal) => {
                      handlePropertyChange(key, newVal);
                      return undefined;
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <NodeView node={currentNode} />

            {/* Connections section */}
            {connectedEdges.length > 0 && (
              <div className="mt-12 pt-8 border-t border-gray-100">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <LinkIcon size={20} /> Connections
                </h3>
                <div className="grid gap-3">
                  {map(connectedEdges, (edge) => {
                    const otherId = edge.source === currentNode.id ? edge.target : edge.source;
                    const otherNode = graph?.nodes.get(otherId);
                    return (
                      <div
                        key={edge.id}
                        onClick={() => {
                          navigate(`../node/${otherId}`);
                          return undefined;
                        }}
                        className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-500">{edge.type}</span>
                          <span className="font-medium">
                            {(() => {
                              const nameProp = otherNode?.properties.get('name');
                              return typeof nameProp === 'string'
                                ? nameProp
                                : otherId;
                            })()}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 font-mono">
                          {edge.source === currentNode.id ? '->' : '<-'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
