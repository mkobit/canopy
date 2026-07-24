import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createApiAdapterContext, createConnectAdapter } from '../src';

const graphId = asGraphId('graph-connect-adapter-test');
const deviceId = asDeviceId('device-connect-adapter-test');

describe('ConnectAdapter complete service assembly', () => {
  it('instantiates and provides all RPC service implementations', async () => {
    const store = createInMemoryEventStore();
    const session = createGraphSession(store, graphId, deviceId);
    await session.load();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    const adapter = createConnectAdapter(context);
    expect(adapter.descriptors.length).toBe(5);
    expect(adapter.protoSdl).toContain('service NodeService');
    expect(adapter.services.nodeService).toBeDefined();
    expect(adapter.services.edgeService).toBeDefined();
    expect(adapter.services.propertyService).toBeDefined();
    expect(adapter.services.mutationService).toBeDefined();
    expect(adapter.services.eventStreamService).toBeDefined();
  });
});
