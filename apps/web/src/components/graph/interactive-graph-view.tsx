import React, { useMemo, useCallback, useEffect } from 'react';
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
import { useGraph } from '../../context/graph-context';
import { showPrompt } from '../../utils/dialogs';
import { useNavigate, useParams } from 'react-router-dom';
import { withResultAlert } from '../../utils/handlers';
import { CustomNode } from './custom-node';
import { CustomEdge } from './custom-edge';
import { asNodeId } from '@canopy/graph';
import { useSpatialGraphNavigation } from './use-spatial-graph-navigation';
import { AriaLiveRegion, useAriaLiveAnnouncer } from './aria-live-region';

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
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | undefined>(undefined);
  const { announcement, announce } = useAriaLiveAnnouncer();

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

  const navigationNodes = useMemo(
    () => nodes.map((n) => ({ id: n.id, position: n.position })),
    [nodes],
  );

  const handleSelectNode = useCallback(
    (nodeId: string | undefined) => {
      setSelectedNodeId(nodeId);
      if (nodeId) {
        announce(`Selected node ${nodeId}`);
      } else {
        announce('Node selection cleared');
      }
    },
    [announce],
  );

  const { handleKeyDown } = useSpatialGraphNavigation({
    nodes: navigationNodes,
    selectedNodeId,
    onSelectNode: handleSelectNode,
  });

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    return undefined;
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = (_: React.MouseEvent, node: Readonly<{ id: string }>) => {
    handleSelectNode(node.id);
    navigate(`/graph/${graphId}/node/${node.id}`);
    return undefined;
  };

  const onConnect = useCallback(
    (parameters: Connection) => {
      const edgeType = showPrompt('Enter edge type (e.g., RelatedTo, HasAuthor):', 'RelatedTo');
      if (!edgeType || !parameters.source || !parameters.target) return undefined;

      const sourceId = asNodeId(parameters.source);
      const targetId = asNodeId(parameters.target);

      void withResultAlert(async () => {
        const createEdgeResult = await createEdge(edgeType, sourceId, targetId);
        announce(`Created edge ${edgeType} between node ${sourceId} and node ${targetId}`);
        return createEdgeResult;
      }, 'Failed to create edge')();

      return undefined;
    },
    [createEdge, announce],
  );

  const onDoubleClick = useCallback(
    (_event: React.MouseEvent) => {
      const name = showPrompt('Enter node name:');
      if (!name) return undefined;

      const type = showPrompt('Enter node type (e.g., Note, Person):', 'Note');
      if (!type) return undefined;

      void withResultAlert(async () => {
        const createNodeResult = await createNode(type, { name });
        announce(`Created node ${type}: ${name}`);
        return createNodeResult;
      }, 'Failed to create node')();

      return undefined;
    },
    [createNode, announce],
  );

  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Interactive graph canvas"
      onKeyDown={handleKeyDown}
      style={{ width: '100%', height: '100%', background: '#f8fafc' }}
    >
      <AriaLiveRegion message={announcement} />
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
        onlyRenderVisibleElements={true}
        fitView
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#cbd5e1" />
      </ReactFlow>
    </div>
  );
};
