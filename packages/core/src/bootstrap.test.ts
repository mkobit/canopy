import { describe, it, expect } from 'bun:test';
import { createGraph } from './graph';
import { asGraphId, unwrap } from '@canopy/types';
import { SYSTEM_IDS } from './system';
import { getNodeTypes, getEdgeTypes, getNodeType } from './queries';
import { bootstrap } from './bootstrap';

describe('Meta-circular bootstrap', () => {
  it('creates a graph with system nodes', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    // Check NodeType definition
    const nodeTypeDef = graph.nodes.get(SYSTEM_IDS.NODE_TYPE_DEF);
    expect(nodeTypeDef).toBeDefined();
    expect(nodeTypeDef?.type).toBe(SYSTEM_IDS.NODE_TYPE);
    expect(nodeTypeDef?.properties.get('name')).toEqual('Node Type');

    // Check EdgeType definition
    const edgeTypeDef = graph.nodes.get(SYSTEM_IDS.EDGE_TYPE_DEF);
    expect(edgeTypeDef).toBeDefined();
    expect(edgeTypeDef?.type).toBe(SYSTEM_IDS.NODE_TYPE); // EdgeType definition is a NodeType
    expect(edgeTypeDef?.properties.get('name')).toEqual('Edge Type');

    // Check Renderer definition
    const rendererDef = graph.nodes.get(SYSTEM_IDS.RENDERER_DEF);
    expect(rendererDef).toBeDefined();
    expect(rendererDef?.type).toBe(SYSTEM_IDS.NODE_TYPE);
    expect(rendererDef?.properties.get('name')).toEqual('Renderer');

    // Check Core Edge Types
    const childOf = graph.nodes.get(SYSTEM_IDS.EDGE_CHILD_OF);
    expect(childOf).toBeDefined();
    expect(childOf?.type).toBe(SYSTEM_IDS.EDGE_TYPE);
    expect(childOf?.properties.get('name')).toEqual('Child Of');
  });

  it('is idempotent', () => {
    const graph1 = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));
    const sizeAfterFirstBootstrap = graph1.nodes.size;

    const graph2 = unwrap(bootstrap(graph1));
    expect(graph2.nodes.size).toBe(sizeAfterFirstBootstrap);
    expect(graph2).toEqual(graph1); // Should be structurally equal as no changes were made
  });

  it('provides query helpers', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    const nodeTypes = getNodeTypes(graph);
    // Should contain NodeType definition and EdgeType definition (as EdgeType definition node has type NodeType... wait)
    // SYSTEM_IDS.EDGE_TYPE_DEF (node) has type SYSTEM_IDS.NODE_TYPE (type)
    // So yes, EdgeType definition node is returned by getNodeTypes?

    // getNodeTypes returns nodes where type === SYSTEM_IDS.NODE_TYPE
    // These are nodes that define a node type.
    // "Node Type" definition (defines "Node Type") -> type "Node Type"
    // "Edge Type" definition (defines "Edge Type") -> type "Node Type" ??

    // In my logic:
    // NODE_TYPE_DEF: id=node:type:node-type, type=node:type:node-type.
    // EDGE_TYPE_DEF: id=node:type:edge-type, type=node:type:node-type.

    // So both are Node Types.
    // One defines the concept of "Node Type".
    // One defines the concept of "Edge Type" (as a node, because edge types are nodes in the graph).

    // Wait, EDGE_TYPE (asTypeId) is node:type:edge-type.
    // EDGE_CHILD_OF (node) has type EDGE_TYPE.

    // So getNodeTypes returns [NODE_TYPE_DEF, EDGE_TYPE_DEF].
    expect(nodeTypes.find((n) => n.id === SYSTEM_IDS.NODE_TYPE_DEF)).toBeDefined();
    expect(nodeTypes.find((n) => n.id === SYSTEM_IDS.EDGE_TYPE_DEF)).toBeDefined();
    expect(nodeTypes.length).toBeGreaterThanOrEqual(2);

    const edgeTypes = getEdgeTypes(graph);
    // Should contain ChildOf, Defines, References, Prerequisite
    expect(edgeTypes.find((n) => n.id === SYSTEM_IDS.EDGE_CHILD_OF)).toBeDefined();
    expect(edgeTypes.length).toBeGreaterThanOrEqual(4);

    const specificType = getNodeType(graph, 'Node Type');
    expect(specificType).toBeDefined();
    expect(specificType?.id).toBe(SYSTEM_IDS.NODE_TYPE_DEF);
  });
});
