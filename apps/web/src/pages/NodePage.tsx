import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGraph } from '../context/GraphContext';
import { NodeView } from '@canopy/ui';
import { Node, NodeId, PropertyValue } from '@canopy/types';
import { ArrowLeft, Save, Trash, Link as LinkIcon } from 'lucide-react';

export const NodePage = () => {
  const { nodeId } = useParams<{ nodeId: string }>();
  const { graph, syncEngine, saveGraph } = useGraph();
  const navigate = useNavigate();
  const [currentNode, setCurrentNode] = useState<Node | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProps, setEditedProps] = useState<Map<string, PropertyValue>>(new Map());

  // Subscribe/Fetch node from graph
  useEffect(() => {
    if (graph && nodeId) {
        const node = graph.nodes.get(nodeId as NodeId);
        setCurrentNode(node);
        if (node) {
            setEditedProps(new Map(node.properties));
        }
    }
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
      if (!syncEngine || !currentNode) return;

      try {
          syncEngine.store.updateNode(currentNode.id, {
              properties: new Map(editedProps)
          });

          await saveGraph(); // Persist changes
          setIsEditing(false);
      } catch (e) {
          console.error("Failed to save node", e);
          alert("Failed to save changes");
      }
  };

  const handlePropertyChange = (key: string, value: PropertyValue) => {
      setEditedProps(prev => {
          const next = new Map(prev);
          next.set(key, value);
          return next;
      });
  };

  const handleDelete = async () => {
      if (!syncEngine || !currentNode) return;
      if (!confirm("Delete this node?")) return;

      try {
          syncEngine.store.deleteNode(currentNode.id);
          await saveGraph();
          navigate('../'); // Go up to graph view
      } catch (e) {
          console.error("Delete failed", e);
      }
  };

  // Find connected edges
  const connectedEdges = useMemo(() => {
      if (!graph || !currentNode) return [];
      const edges = [];
      for (const edge of graph.edges.values()) {
          if (edge.source === currentNode.id || edge.target === currentNode.id) {
              edges.push(edge);
          }
      }
      return edges;
  }, [graph, currentNode]);

  return (
    <div className="max-w-3xl mx-auto bg-white min-h-full shadow-sm border-x border-gray-100 flex flex-col">
       <div className="p-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white/80 backdrop-blur-md z-10">
           <button onClick={() => navigate('../')} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
               <ArrowLeft size={20} />
           </button>

           <div className="flex items-center gap-2">
               {isEditing ? (
                   <>
                       <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
                       <button onClick={handleSave} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                           <Save size={16} /> Save
                       </button>
                   </>
               ) : (
                   <>
                       <button onClick={handleDelete} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-md">
                           <Trash size={18} />
                       </button>
                       <button onClick={() => setIsEditing(true)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">
                           Edit
                       </button>
                   </>
               )}
           </div>
       </div>

       <div className="p-8 flex-1">
           {/* We can use NodeView or build a custom editor form */}
           {/* Since we need editing, we build a form here if NodeView is read-only.
               Checking memory: "NodeView/EdgeView for individual elements". It doesn't say read-only explicitly but implies view.
               And "Node editing... modify node properties".
               I will assume NodeView is display only.
            */}

            {isEditing ? (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-500">Node Type</label>
                        <div className="text-lg font-mono text-gray-800 bg-gray-50 p-2 rounded border">{currentNode.type}</div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-semibold text-gray-900">Properties</h3>
                        {Array.from(editedProps.entries()).map(([key, val]) => (
                            <div key={key} className="space-y-1">
                                <label className="text-sm text-gray-600">{key}</label>
                                {/* Rudimentary property editor */}
                                {val.kind === 'text' && (
                                    <textarea
                                        className="w-full p-2 border rounded-md"
                                        value={val.value}
                                        onChange={(e) => handlePropertyChange(key, { ...val, value: e.target.value })}
                                    />
                                )}
                                {val.kind !== 'text' && (
                                    <div className="p-2 bg-yellow-50 text-yellow-700 text-sm border border-yellow-100 rounded">
                                        Editing for {val.kind} not implemented yet.
                                    </div>
                                )}
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
                               {connectedEdges.map(edge => {
                                   const otherId = edge.source === currentNode.id ? edge.target : edge.source;
                                   const otherNode = graph?.nodes.get(otherId);
                                   return (
                                       <div
                                         key={edge.id}
                                         onClick={() => navigate(`../node/${otherId}`)}
                                         className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                       >
                                           <div className="flex flex-col">
                                                <span className="text-sm text-gray-500">{edge.type}</span>
                                                <span className="font-medium">
                                                    {(() => {
                                                        const nameProp = otherNode?.properties.get('name');
                                                        return (nameProp && nameProp.kind === 'text' ? nameProp.value : otherId);
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
