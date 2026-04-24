import type { Graph, Node, Edge, TypeId, NodeId, Result } from '@canopy/types';
import { SYSTEM_IDS } from './system';
import { asNodeId, ok, err } from '@canopy/types';
import { filter } from 'remeda';
import { findNode } from './utils';

/**
 * Returns all nodes that define node types.
 */
export function getNodeTypes(graph: Readonly<Graph>): readonly Node[] {
  return filter([...graph.nodes.values()], (node) => node.type === SYSTEM_IDS.NODE_TYPE);
}

/**
 * Returns all nodes that define edge types.
 */
export function getEdgeTypes(graph: Readonly<Graph>): readonly Node[] {
  return filter([...graph.nodes.values()], (node) => node.type === SYSTEM_IDS.EDGE_TYPE);
}

/**
 * Returns a specific node type definition node by its name,
 * or by its ID if the name is not found (or if name is treated as ID).
 *
 * Note: Type definitions are Nodes.
 * If you have a TypeId "foo", the corresponding definition node should have ID "foo".
 */
export function getNodeType(graph: Readonly<Graph>, typeNameOrId: string): Node | undefined {
  // First try to find by ID (asuming the type name is the ID)
  const nodeId = asNodeId(typeNameOrId);
  const node = graph.nodes.get(nodeId);
  if (node && node.type === SYSTEM_IDS.NODE_TYPE) {
    return node;
  }

  // Fallback: search by name property
  // This assumes names are unique, which isn't guaranteed but useful for loose lookup
  return findNode(graph, (n) => {
    if (n.type !== SYSTEM_IDS.NODE_TYPE) return false;
    const nameProp = n.properties.get('name');
    return nameProp === typeNameOrId;
  });
}

/**
 * Returns a specific edge type definition node by its name,
 * or by its ID if the name is not found (or if name is treated as ID).
 *
 * Note: Type definitions are Nodes.
 */
export function getEdgeType(graph: Readonly<Graph>, typeNameOrId: string): Node | undefined {
  // First try to find by ID (assuming the type name is the ID)
  const nodeId = asNodeId(typeNameOrId);
  const node = graph.nodes.get(nodeId);
  if (node && node.type === SYSTEM_IDS.EDGE_TYPE) {
    return node;
  }

  // Fallback: search by name property
  return findNode(graph, (n) => {
    if (n.type !== SYSTEM_IDS.EDGE_TYPE) return false;
    const nameProp = n.properties.get('name');
    return nameProp === typeNameOrId;
  });
}

/**
 * Returns all nodes whose type matches the given typeId.
 */
export function getNodesOfType(graph: Readonly<Graph>, typeId: TypeId): readonly Node[] {
  return filter([...graph.nodes.values()], (node) => node.type === typeId);
}

/**
 * Returns all edges whose type matches the given typeId.
 */
export function getEdgesOfType(graph: Readonly<Graph>, typeId: TypeId): readonly Edge[] {
  return filter([...graph.edges.values()], (edge) => edge.type === typeId);
}

/**
 * Returns all edges originating from the given nodeId, optionally filtered by edgeTypeId.
 */
export function getEdgesFrom(
  graph: Readonly<Graph>,
  nodeId: NodeId,
  edgeTypeId?: TypeId,
): readonly Edge[] {
  return filter(
    [...graph.edges.values()],
    (edge) => edge.source === nodeId && (edgeTypeId === undefined || edge.type === edgeTypeId),
  );
}

/**
 * Finds the inverse edge type for a given edge type.
 * Returns ok(Node) if an inverse is found, ok(undefined) if no inverse is defined,
 * and err(Error) if the edge type node doesn't exist, isn't an edge type, or has a broken reference.
 */
export function findInverseEdgeType(
  graph: Readonly<Graph>,
  edgeTypeId: TypeId,
): Result<Node | undefined, Error> {
  const edgeTypeNodeId = asNodeId(edgeTypeId);
  const edgeTypeNode = graph.nodes.get(edgeTypeNodeId);

  if (!edgeTypeNode) {
    return err(new Error(`Edge type node not found for type: ${edgeTypeId}`));
  }

  if (edgeTypeNode.type !== SYSTEM_IDS.EDGE_TYPE) {
    return err(new Error(`Node ${edgeTypeId} is not an edge type (is ${edgeTypeNode.type})`));
  }

  const inverseProp = edgeTypeNode.properties.get('inverse');

  if (inverseProp === undefined) {
    return ok(undefined);
  }

  if (typeof inverseProp !== 'string') {
    return err(new Error(`Inverse property on edge type ${edgeTypeId} must be a string`));
  }

  const inverseNodeId = asNodeId(inverseProp);
  const inverseNode = graph.nodes.get(inverseNodeId);

  if (!inverseNode) {
    return err(
      new Error(`Broken reference: inverse edge type ${inverseProp} for ${edgeTypeId} not found`),
    );
  }

  if (inverseNode.type !== SYSTEM_IDS.EDGE_TYPE) {
    return err(
      new Error(
        `Inverse node ${inverseProp} for ${edgeTypeId} is not an edge type (is ${inverseNode.type})`,
      ),
    );
  }

  return ok(inverseNode);
}
