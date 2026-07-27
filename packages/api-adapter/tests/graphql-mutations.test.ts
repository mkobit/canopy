import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, asNodeId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createApiAdapterContext } from '../src/api-context';
import {
  createMutationResolvers,
  validateActorDelegation,
} from '../src/graphql/resolvers/mutations';

const graphId = asGraphId('g1');
const deviceId = asDeviceId('device-1');

const setupTestContext = async () => {
  const store = createInMemoryEventStore();
  const session = createGraphSession(store, graphId, deviceId);
  await session.load();
  const graph = session.graph();
  return createApiAdapterContext({ graph, session, eventLogStore: store });
};

describe('GraphQL mutation resolvers & actor delegation', () => {
  describe('validateActorDelegation', () => {
    it('returns DIRECT_USER when actor input is omitted or USER', async () => {
      const context = await setupTestContext();

      const defaultActor = validateActorDelegation(context, undefined);
      expect(defaultActor).toEqual({
        principalId: 'user:default',
        actingId: 'user:default',
        actorType: 'USER',
        approvalState: 'DIRECT_USER',
      });

      const userActor = validateActorDelegation(context, { actorType: 'USER' });
      expect(userActor.approvalState).toBe('DIRECT_USER');
    });

    it('returns APPROVED when AGENT or PLUGIN provides valid delegation token', async () => {
      const context = await setupTestContext();

      const agentActor = validateActorDelegation(context, {
        actorType: 'AGENT',
        actingId: 'agent:123',
        delegationToken: 'valid-token',
      });

      expect(agentActor).toEqual({
        principalId: 'user:default',
        actingId: 'agent:123',
        actorType: 'AGENT',
        delegationId: 'delegation:valid-token',
        approvalState: 'APPROVED',
      });

      const pluginActor = validateActorDelegation(context, {
        actorType: 'PLUGIN',
        delegationToken: 'token-456',
      });

      expect(pluginActor.actingId).toBe('agent:authenticated');
      expect(pluginActor.approvalState).toBe('APPROVED');
    });

    it('throws AGENT_APPROVAL_REQUIRED when delegation token is missing or invalid', async () => {
      const context = await setupTestContext();

      expect(() => {
        validateActorDelegation(context, { actorType: 'AGENT' });
      }).toThrow('Agent execution requires a valid delegation token');

      expect(() => {
        validateActorDelegation(context, { actorType: 'PLUGIN', delegationToken: 'invalid' });
      }).toThrow('Agent execution requires a valid delegation token');
    });

    it('returns SYSTEM_PERMITTED for SYSTEM or WORKFLOW actor types', async () => {
      const context = await setupTestContext();

      const systemActor = validateActorDelegation(context, { actorType: 'SYSTEM' });
      expect(systemActor).toEqual({
        principalId: 'user:default',
        actingId: 'system:kernel',
        actorType: 'SYSTEM',
        approvalState: 'SYSTEM_PERMITTED',
      });
    });
  });

  describe('createMutationResolvers', () => {
    it('executes createNode mutation successfully', async () => {
      const context = await setupTestContext();
      const resolvers = createMutationResolvers(context);

      const result = await resolvers.createNode(null, {
        input: {
          id: 'node-1',
          type: 'system:nodetype:text-block',
          properties: { text: 'Hello GraphQL', content: [] },
        },
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe(asNodeId('node-1'));
      expect(result.affectedEventsCount).toBeGreaterThan(0);
      expect(result.actorContext.approvalState).toBe('DIRECT_USER');
    });

    it('executes updateNodeProperties mutation successfully', async () => {
      const context = await setupTestContext();
      const resolvers = createMutationResolvers(context);

      await resolvers.createNode(null, {
        input: { id: 'node-1', type: 'doc', properties: { title: 'Initial' } },
      });

      const updated = await resolvers.updateNodeProperties(null, {
        input: { id: 'node-1', properties: { title: 'Updated Title' } },
      });

      expect(updated.success).toBe(true);
      expect(updated.id).toBe(asNodeId('node-1'));
    });

    it('executes createEdge and deleteEdge mutations successfully', async () => {
      const context = await setupTestContext();
      const resolvers = createMutationResolvers(context);

      await resolvers.createNode(null, { input: { id: 'n1', type: 'doc', properties: {} } });
      await resolvers.createNode(null, { input: { id: 'n2', type: 'doc', properties: {} } });

      const edgeResult = await resolvers.createEdge(null, {
        input: { id: 'e1', type: 'links', source: 'n1', target: 'n2', properties: { weight: 1 } },
      });

      expect(edgeResult.success).toBe(true);

      const deleteResult = await resolvers.deleteEdge(null, {
        input: { id: 'e1' },
      });

      expect(deleteResult.success).toBe(true);
    });

    it('executes deleteNode mutation successfully', async () => {
      const context = await setupTestContext();
      const resolvers = createMutationResolvers(context);

      await resolvers.createNode(null, { input: { id: 'n1', type: 'doc', properties: {} } });

      const deleteResult = await resolvers.deleteNode(null, {
        input: { id: 'n1' },
      });

      expect(deleteResult.success).toBe(true);
    });

    it('throws GraphQLError when mutation fails', async () => {
      const context = await setupTestContext();
      const resolvers = createMutationResolvers(context);

      await expect(
        resolvers.updateNodeProperties(null, {
          input: { id: 'non-existent', properties: { foo: 'bar' } },
        }),
      ).rejects.toThrow();
    });
  });
});
