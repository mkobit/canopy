import React, { useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGraph } from '../../context/GraphContext';
import { useNavigate, useParams } from 'react-router-dom';

export const InteractiveGraphView = () => {
  const { graph } = useGraph();
  const navigate = useNavigate();
  const { graphId } = useParams();

  const initialNodes = useMemo(() => {
    if (!graph) return [];

    // Calculate a simple grid layout
    // eslint-disable-next-line functional/no-let
    let x = 100;
    // eslint-disable-next-line functional/no-let
    let y = 100;
    const spacingX = 300;
    const spacingY = 150;
    const rowLimit = 5;
    // eslint-disable-next-line functional/no-let
    let currentInRow = 0;

    return [...graph.nodes.values()].map((node) => {
      const name =
        typeof node.properties.get('name') === 'string'
          ? node.properties.get('name')
          : node.id.slice(0, 8);

      const pos = { x, y };
      currentInRow++;
      if (currentInRow >= rowLimit) {
        currentInRow = 0;
        x = 100;
        y += spacingY;
      } else {
        x += spacingX;
      }

      return {
        id: node.id,
        position: pos,
        data: { label: `${name} (${node.type})` },
        style: {
          background: '#121a25',
          color: '#d9e6fd',
          border: '1px solid #3c495b',
          borderRadius: '4px',
          padding: '10px',
          fontFamily: 'monospace',
        },
      };
    });
  }, [graph]);

  const initialEdges = useMemo(() => {
    if (!graph) return [];
    return [...graph.edges.values()].map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.type,
      labelStyle: { fill: '#9facc1', fontSize: 10, fontFamily: 'monospace' },
      labelBgStyle: { fill: '#0a0e14' },
      style: { stroke: '#3c495b', strokeWidth: 1.5 },
      animated: true,
    }));
  }, [graph]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Keep in sync with graph changes
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    return undefined;
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onNodeClick = (_: React.MouseEvent, node: any) => {
    navigate(`/graph/${graphId}/node/${node.id}`);
    return undefined;
  };

  return (
    <div style={{ width: '100%', height: '100%', background: '#0a0e14' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#3c495b" />
      </ReactFlow>
    </div>
  );
};
