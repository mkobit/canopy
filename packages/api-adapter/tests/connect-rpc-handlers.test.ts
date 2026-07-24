import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createApiAdapterContext } from '../src/api-context';
import {
  createConnectMutationHandlers,
  createConnectQueryHandlers,
} from '../src/connect/handlers/queries-mutations';

const graphId = asGraphId('graph-connect-test');
const deviceId = asDeviceId('device-connect-test');

const setupTestContext = async () => {
  const store = createInMemoryEventStore();
  const session = createGraphSession(store, graphId, deviceId);
  await session.load();
  const context = createApiAdapterContext({ graph: session.graph(), session });
  return { context, session };
};

describe('Connect query and mutation RPC handlers', () => {
  it('executes node, edge, and property query and mutation RPC operations', async () => {
    const { context } = await setupTestContext();

    const mutationHandlers = createConnectMutationHandlers(context);
    const queryHandlers = createConnectQueryHandlers(context);

    // 1. createNode
    const createNodeRes1 = await mutationHandlers.createNode({
      type_id: 'concept',
      properties_json: JSON.stringify({ title: 'First Node', category: 'architecture' }),
    });
    expect(createNodeRes1.success).toBe(true);
    expect(createNodeRes1.entity_id).toBeDefined();
    const node1Id = createNodeRes1.entity_id ?? '';

    const createNodeRes2 = await mutationHandlers.createNode({
      type_id: 'concept',
      properties_json: JSON.stringify({ title: 'Second Node', category: 'architecture' }),
    });
    expect(createNodeRes2.success).toBe(true);
    expect(createNodeRes2.entity_id).toBeDefined();
    const node2Id = createNodeRes2.entity_id ?? '';

    // 2. getNodeById
    const getNodeRes = await queryHandlers.getNodeById({ id: node1Id });
    expect(getNodeRes.success).toBe(true);
    expect(getNodeRes.id).toBe(node1Id);
    expect(getNodeRes.type_id).toBe('concept');
    expect(getNodeRes.properties_json).toContain('First Node');

    // 3. getNodesByType
    const getByTypeRes = await queryHandlers.getNodesByType({ type_id: 'concept' });
    expect(getByTypeRes.success).toBe(true);
    expect(getByTypeRes.nodes.length).toBe(2);

    // 4. getNodesByProperty
    const getByPropRes = await queryHandlers.getNodesByProperty({
      key: 'category',
      value_json: JSON.stringify('architecture'),
    });
    expect(getByPropRes.success).toBe(true);
    expect(getByPropRes.nodes.length).toBe(2);

    // 5. createEdge
    const createEdgeRes = await mutationHandlers.createEdge({
      source_node_id: node1Id,
      target_node_id: node2Id,
      predicate_type_id: 'relates_to',
      properties_json: JSON.stringify({ weight: 1 }),
    });
    expect(createEdgeRes.success).toBe(true);
    expect(createEdgeRes.entity_id).toBeDefined();
    const edgeId = createEdgeRes.entity_id ?? '';

    // 6. getInboundEdges
    const getInboundRes = await queryHandlers.getInboundEdges({
      target_node_id: node2Id,
      predicate_type_id: 'relates_to',
    });
    expect(getInboundRes.success).toBe(true);
    expect(getInboundRes.edges.length).toBe(1);
    expect(getInboundRes.edges[0]?.id).toBe(edgeId);

    // 7. getOutboundEdges
    const getOutboundRes = await queryHandlers.getOutboundEdges({
      source_node_id: node1Id,
      predicate_type_id: 'relates_to',
    });
    expect(getOutboundRes.success).toBe(true);
    expect(getOutboundRes.edges.length).toBe(1);
    expect(getOutboundRes.edges[0]?.id).toBe(edgeId);

    // 8. executeTraversalQuery
    const traversalRes = await queryHandlers.executeTraversalQuery({
      start_node_id: node1Id,
      max_depth: 2,
      filter_predicate_type_ids: ['relates_to'],
    });
    expect(traversalRes.success).toBe(true);
    expect(traversalRes.steps.length).toBeGreaterThanOrEqual(1);

    // 9. updateNodeProperties
    const updateRes = await mutationHandlers.updateNodeProperties({
      id: node1Id,
      properties_json: JSON.stringify({ title: 'Updated First Node' }),
    });
    expect(updateRes.success).toBe(true);
    expect(updateRes.entity_id).toBe(node1Id);

    const verifyUpdateRes = await queryHandlers.getNodeById({ id: node1Id });
    expect(verifyUpdateRes.properties_json).toContain('Updated First Node');

    // 10. deleteEdge
    const deleteEdgeRes = await mutationHandlers.deleteEdge({ id: edgeId });
    expect(deleteEdgeRes.success).toBe(true);
    expect(deleteEdgeRes.entity_id).toBe(edgeId);

    const getInboundAfterDelete = await queryHandlers.getInboundEdges({
      target_node_id: node2Id,
    });
    expect(getInboundAfterDelete.edges.length).toBe(0);

    // 11. deleteNode
    const deleteNodeRes = await mutationHandlers.deleteNode({ id: node2Id });
    expect(deleteNodeRes.success).toBe(true);
    expect(deleteNodeRes.entity_id).toBe(node2Id);

    const getNodeAfterDelete = await queryHandlers.getNodeById({ id: node2Id });
    expect(getNodeAfterDelete.success).toBe(false);
    expect(getNodeAfterDelete.error_code).toBe('NOT_FOUND');
  });
});
