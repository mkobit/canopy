import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import type { Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGraph } from '../../context/GraphContext';
import { showPrompt } from '../../utils/dialogs';
import { useNavigate, useParams } from 'react-router-dom';
import { withResultAlert } from '../../utils/handlers';
import { CustomNode } from './CustomNode';
import { CustomEdge } from './CustomEdge';
import type { NodeId } from '@canopy/types';

const nodeTypes = {
  customNode: CustomNode,
};

const edgeTypes = {
  customEdge: CustomEdge,
};

// eslint-disable-next-line max-lines-per-function
export const InteractiveGraphView = () => {
  const { graph, createNode, createEdge } = useGraph();
  const navigate = useNavigate();
  const { graphId } = useParams();

  const initialNodes = useMemo(() => {
    if (!graph) return [];

    // eslint-disable-next-line functional/no-let
    let x = 100;
    // eslint-disable-next-line functional/no-let
    let y = 100;
    const spacingX = 350;
    const spacingY = 200;
    const rowLimit = 4;
    // eslint-disable-next-line functional/no-let
    let currentInRow = 0;

    return [...graph.nodes.values()].map((node) => {
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
        type: 'customNode',
        position: pos,
        data: { node },
      };
    });
  }, [graph]);

  const initialEdges = useMemo(() => {
    if (!graph) return [];
    return [...graph.edges.values()].map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'customEdge',
      label: edge.type,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#cbd5e1',
      },
      data: { edge },
    }));
  }, [graph]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    return undefined;
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = (_: React.MouseEvent, node: Readonly<{ id: string }>) => {
    navigate(`/graph/${graphId}/node/${node.id}`);
    return undefined;
  };

  const onConnect = useCallback(
    (params: Connection) => {
      const edgeType = showPrompt('Enter edge type (e.g., RelatedTo, HasAuthor):', 'RelatedTo');
      if (!edgeType || !params.source || !params.target) return undefined;

      const sourceId = params.source as unknown as NodeId;
      const targetId = params.target as unknown as NodeId;

      void withResultAlert(
        () => createEdge(edgeType, sourceId, targetId),
        'Failed to create edge',
      )();

      return undefined;
    },
    [createEdge],
  );

  const onDoubleClick = useCallback(
    (_event: React.MouseEvent) => {
      const name = showPrompt('Enter node name:');
      if (!name) return undefined;

      const type = showPrompt('Enter node type (e.g., Note, Person):', 'Note');
      if (!type) return undefined;

      void withResultAlert(() => createNode(type, { name }), 'Failed to create node')();

      return undefined;
    },
    [createNode],
  );

  return (
    <div style={{ width: '100%', height: '100%', background: '#f8fafc' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onConnect={onConnect}
        onDoubleClick={onDoubleClick}
        fitView
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#cbd5e1" />
      </ReactFlow>
    </div>
  );
};
