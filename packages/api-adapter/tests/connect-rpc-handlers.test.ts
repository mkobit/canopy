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
    const createNodeResponse1 = await mutationHandlers.createNode({
      type_id: 'concept',
      properties_json: JSON.stringify({ title: 'First Node', category: 'architecture' }),
    });
    expect(createNodeResponse1.success).toBe(true);
    expect(createNodeResponse1.entity_id).toBeDefined();
    const node1Id = createNodeResponse1.entity_id ?? '';

    const createNodeResponse2 = await mutationHandlers.createNode({
      type_id: 'concept',
      properties_json: JSON.stringify({ title: 'Second Node', category: 'architecture' }),
    });
    expect(createNodeResponse2.success).toBe(true);
    expect(createNodeResponse2.entity_id).toBeDefined();
    const node2Id = createNodeResponse2.entity_id ?? '';

    // 2. getNodeById
    const getNodeResponse = await queryHandlers.getNodeById({ id: node1Id });
    expect(getNodeResponse.success).toBe(true);
    expect(getNodeResponse.id).toBe(node1Id);
    expect(getNodeResponse.type_id).toBe('concept');
    expect(getNodeResponse.properties_json).toContain('First Node');

    // 3. getNodesByType
    const getByTypeResponse = await queryHandlers.getNodesByType({ type_id: 'concept' });
    expect(getByTypeResponse.success).toBe(true);
    expect(getByTypeResponse.nodes.length).toBe(2);

    // 4. getNodesByProperty
    const getByPropertyResponse = await queryHandlers.getNodesByProperty({
      key: 'category',
      value_json: JSON.stringify('architecture'),
    });
    expect(getByPropertyResponse.success).toBe(true);
    expect(getByPropertyResponse.nodes.length).toBe(2);

    // 5. createEdge
    const createEdgeResponse = await mutationHandlers.createEdge({
      source_node_id: node1Id,
      target_node_id: node2Id,
      predicate_type_id: 'relates_to',
      properties_json: JSON.stringify({ weight: 1 }),
    });
    expect(createEdgeResponse.success).toBe(true);
    expect(createEdgeResponse.entity_id).toBeDefined();
    const edgeId = createEdgeResponse.entity_id ?? '';

    // 6. getInboundEdges
    const getInboundResponse = await queryHandlers.getInboundEdges({
      target_node_id: node2Id,
      predicate_type_id: 'relates_to',
    });
    expect(getInboundResponse.success).toBe(true);
    expect(getInboundResponse.edges.length).toBe(1);
    expect(getInboundResponse.edges[0]?.id).toBe(edgeId);

    // 7. getOutboundEdges
    const getOutboundResponse = await queryHandlers.getOutboundEdges({
      source_node_id: node1Id,
      predicate_type_id: 'relates_to',
    });
    expect(getOutboundResponse.success).toBe(true);
    expect(getOutboundResponse.edges.length).toBe(1);
    expect(getOutboundResponse.edges[0]?.id).toBe(edgeId);

    // 8. executeTraversalQuery
    const traversalResponse = await queryHandlers.executeTraversalQuery({
      start_node_id: node1Id,
      max_depth: 2,
      filter_predicate_type_ids: ['relates_to'],
    });
    expect(traversalResponse.success).toBe(true);
    expect(traversalResponse.steps.length).toBeGreaterThanOrEqual(1);

    // 9. updateNodeProperties
    const updateResponse = await mutationHandlers.updateNodeProperties({
      id: node1Id,
      properties_json: JSON.stringify({ title: 'Updated First Node' }),
    });
    expect(updateResponse.success).toBe(true);
    expect(updateResponse.entity_id).toBe(node1Id);

    const verifyUpdateResponse = await queryHandlers.getNodeById({ id: node1Id });
    expect(verifyUpdateResponse.properties_json).toContain('Updated First Node');

    // 10. deleteEdge
    const deleteEdgeResponse = await mutationHandlers.deleteEdge({ id: edgeId });
    expect(deleteEdgeResponse.success).toBe(true);
    expect(deleteEdgeResponse.entity_id).toBe(edgeId);

    const getInboundAfterDelete = await queryHandlers.getInboundEdges({
      target_node_id: node2Id,
    });
    expect(getInboundAfterDelete.edges.length).toBe(0);

    // 11. deleteNode
    const deleteNodeResponse = await mutationHandlers.deleteNode({ id: node2Id });
    expect(deleteNodeResponse.success).toBe(true);
    expect(deleteNodeResponse.entity_id).toBe(node2Id);

    const getNodeAfterDelete = await queryHandlers.getNodeById({ id: node2Id });
    expect(getNodeAfterDelete.success).toBe(false);
    expect(getNodeAfterDelete.error_code).toBe('NOT_FOUND');
  });
});
