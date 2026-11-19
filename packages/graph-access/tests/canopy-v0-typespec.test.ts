import { describe, expect, test } from 'bun:test';
import {
  SYSTEM_IDS,
  asDeviceId,
  asGraphId,
  asNodeId,
  asTypeId,
  createEdgeId,
  createEventId,
  createGraphSession,
  createInstant,
  type GraphEvent,
} from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import {
  CANOPY_V0_ROUTES,
  createCanopyV0Client,
  createCanopyV0InProcessHandlers,
  createCanopyV0ServerRouter,
  createFetchCanopyV0Transport,
  createGraphAccessContext,
  createInProcessCanopyV0Transport,
  type CanopyV0ActorProvenance,
} from '../src';

const provenance: CanopyV0ActorProvenance = {
  principalId: 'principal-alice',
  actorId: 'alice',
  actorKind: 'user',
  deviceId: '00000000-0000-0000-0000-0000000000a1',
  hlcTimestamp: '1700000000000:0:alice',
};

const setupSdk = async () => {
  const store = createInMemoryEventStore();
  const graphId = asGraphId('00000000-0000-7000-8000-000000000101');
  const deviceId = asDeviceId('00000000-0000-0000-0000-0000000000a1');
  const session = createGraphSession(store, graphId, deviceId);
  await session.load();

  const context = createGraphAccessContext({
    graph: session.graph(),
    session,
    eventLogStore: store,
  });
  const handlers = createCanopyV0InProcessHandlers(context);
  const router = createCanopyV0ServerRouter(handlers);
  const client = createCanopyV0Client(createInProcessCanopyV0Transport(router));

  return { graphId, session, router, client };
};

describe('TypeSpec canopy.v0 server router and client SDK', () => {
  test('exposes routes for all 6 TypeSpec namespaces', () => {
    const namespaces = new Set(CANOPY_V0_ROUTES.map((route) => route.namespace));
    expect([...namespaces]).toEqual([
      'Graphs',
      'Transactions',
      'Queries',
      'Views',
      'Bundles',
      'Streams',
    ]);
  });

  test('supports Graphs CRUD, Graph CAS, and Fetch transport bridging', async () => {
    const { graphId, router, client } = await setupSdk();

    const listResult = await client.graphs.listGraphs();
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;
    expect(listResult.value.graphs.map((g) => g.graphId)).toContain(graphId);

    const created = await client.graphs.createGraph({ name: 'Secondary Graph', provenance });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const secondGraphId = created.value.graphId;

    // Exercise createFetchCanopyV0Transport against the same server router.
    const fetchClient = createCanopyV0Client(
      createFetchCanopyV0Transport({
        baseUrl: 'https://canopy.local',
        fetch: async (input, init) => {
          const url = new URL(input);
          const body =
            typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
          const routed = await router.dispatch({
            method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
            path: `${url.pathname}${url.search}`,
            body,
          });
          return Response.json(routed.body, {
            status: routed.status,
          });
        },
      }),
    );

    const fetched = await fetchClient.graphs.getGraph({
      graphId: secondGraphId,
      consistency: { minCommitSeq: 0 },
    });
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.value.name).toBe('Secondary Graph');

    const conflictDelete = await fetchClient.graphs.deleteGraph({
      graphId: secondGraphId,
      expectedGraphSeq: 99,
    });
    expect(conflictDelete.ok).toBe(false);
    if (!conflictDelete.ok) {
      expect(conflictDelete.error.category).toBe('CONCURRENCY_CONFLICT');
    }

    const okDelete = await fetchClient.graphs.deleteGraph({
      graphId: secondGraphId,
      expectedGraphSeq: 0,
    });
    expect(okDelete.ok).toBe(true);
  });

  test('supports atomic multi-entity batch commits, Entity/Graph CAS, drafts, and minCommitSeq reads', async () => {
    const { graphId, client } = await setupSdk();

    const batch1 = await client.transactions.commitTransaction({
      graphId,
      provenance,
      precondition: { mode: 'unconditional' },
      operations: [
        {
          kind: 'create-node',
          entityId: 'node-raw-1',
          properties: [{ key: 'title', valueJson: JSON.stringify('Raw capture') }],
        },
        {
          kind: 'create-node',
          entityId: 'node-proxy-wiki',
          properties: [
            {
              key: 'canonicalUri',
              valueJson: JSON.stringify('https://en.wikipedia.org/wiki/Graph'),
            },
          ],
        },
        {
          kind: 'create-edge',
          entityId: 'edge-ref-1',
          edgeTypeId: SYSTEM_IDS.EDGE_REFERENCES,
          sourceNodeId: 'node-raw-1',
          targetNodeId: 'node-proxy-wiki',
        },
      ],
    });
    expect(batch1.ok).toBe(true);
    if (!batch1.ok) return;
    expect(batch1.value.commitSeq).toBe(1);

    // minCommitSeq read-your-writes succeeds for 1, conflicts for 2
    const proxyLookup = await client.queries.queryNodes({
      graphId,
      canonicalUri: 'https://en.wikipedia.org/wiki/Graph',
      consistency: { minCommitSeq: 1 },
    });
    expect(proxyLookup.ok).toBe(true);
    if (proxyLookup.ok) {
      expect(proxyLookup.value.nodes.map((n) => n.nodeId)).toEqual(['node-proxy-wiki']);
    }

    const aheadRead = await client.queries.queryNodes({
      graphId,
      consistency: { minCommitSeq: 2 },
    });
    expect(aheadRead.ok).toBe(false);
    if (!aheadRead.ok) {
      expect(aheadRead.error.category).toBe('CONCURRENCY_CONFLICT');
    }

    // Entity CAS: stale expectedSeq fails, current expectedSeq succeeds
    const staleCas = await client.transactions.commitTransaction({
      graphId,
      provenance,
      precondition: {
        mode: 'entity-cas',
        expectedEntitySeq: [{ entityId: 'node-raw-1', expectedSeq: 0 }],
      },
      operations: [
        {
          kind: 'update-node-properties',
          entityId: 'node-raw-1',
          properties: [{ key: 'title', valueJson: JSON.stringify('Stale edit') }],
        },
      ],
    });
    expect(staleCas.ok).toBe(false);
    if (!staleCas.ok) {
      expect(staleCas.error.category).toBe('CONCURRENCY_CONFLICT');
    }

    const validCas = await client.transactions.commitTransaction({
      graphId,
      provenance,
      precondition: {
        mode: 'entity-cas',
        expectedEntitySeq: [{ entityId: 'node-raw-1', expectedSeq: 1 }],
      },
      operations: [
        {
          kind: 'update-node-properties',
          entityId: 'node-raw-1',
          properties: [{ key: 'title', valueJson: JSON.stringify('Claimed edit') }],
        },
      ],
    });
    expect(validCas.ok).toBe(true);
    if (!validCas.ok) return;
    expect(validCas.value.commitSeq).toBe(2);

    // Point-in-time snapshot at commitSeq 1 shows original title before commit 2
    const snap1 = await client.queries.getHistorySnapshot({ graphId, atCommitSeq: 1 });
    expect(snap1.ok).toBe(true);
    if (snap1.ok) {
      const nodeAt1 = snap1.value.nodes.find((n) => n.nodeId === 'node-raw-1');
      expect(nodeAt1?.properties.find((p) => p.key === 'title')?.valueJson).toBe('"Raw capture"');
    }

    // Draft lifecycle: create -> stage -> commit, plus discard
    const draft = await client.transactions.createDraft({ graphId, provenance });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const staged = await client.transactions.stageDraftOperations({
      graphId,
      draftId: draft.value.draftId,
      operations: [{ kind: 'create-node', entityId: 'node-from-draft' }],
    });
    expect(staged.ok).toBe(true);
    if (staged.ok) {
      expect(staged.value.stagedOperationCount).toBe(1);
    }
    const committedDraft = await client.transactions.commitDraft({
      graphId,
      draftId: draft.value.draftId,
      provenance,
    });
    expect(committedDraft.ok).toBe(true);
    if (committedDraft.ok) {
      expect(committedDraft.value.commitSeq).toBe(3);
    }

    const draft2 = await client.transactions.createDraft({ graphId, provenance });
    expect(draft2.ok).toBe(true);
    if (!draft2.ok) return;
    const discarded = await client.transactions.discardDraft({
      graphId,
      draftId: draft2.value.draftId,
    });
    expect(discarded.ok).toBe(true);
    if (discarded.ok) {
      expect(discarded.value.status).toBe('discarded');
    }
  });

  test('supports decoupled Views with RenderSelector cycles, settings cascade, bundles, migrations, and streams', async () => {
    const { graphId, session, client } = await setupSdk();

    const deviceId = asDeviceId('00000000-0000-0000-0000-0000000000a1');
    const setupEvents: readonly GraphEvent[] = [
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: asNodeId('view:standalone'),
        nodeType: SYSTEM_IDS.VIEW_DEFINITION,
        properties: new Map([
          ['name', 'Scratchpad'],
          ['layout', 'layout-stack'],
          ['bindingKind', 'standalone'],
          ['rendererPluginRef', 'system:markdown'],
        ]),
        timestamp: createInstant(),
        deviceId,
      },
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: asNodeId('view:cycle-a'),
        nodeType: SYSTEM_IDS.VIEW_DEFINITION,
        properties: new Map([
          ['name', 'Cycle A'],
          ['layout', 'layout-stack'],
        ]),
        timestamp: createInstant(),
        deviceId,
      },
      {
        type: 'EdgeCreated',
        eventId: createEventId(),
        id: createEdgeId(),
        edgeType: asTypeId('system:edgetype:render-selector'),
        source: asNodeId('view:cycle-a'),
        target: asNodeId('view:cycle-a'),
        properties: new Map<string, string | number>([
          ['context', 'default'],
          ['priority', 10],
        ]),
        timestamp: createInstant(),
        deviceId,
      },
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: asNodeId('setting:shape-density'),
        nodeType: SYSTEM_IDS.USER_SETTING,
        properties: new Map([
          ['schemaId', SYSTEM_IDS.SETTING_DISPLAY_DENSITY],
          ['scopeType', 'type'],
          ['scopeTarget', 'shape:task'],
          ['value', JSON.stringify('compact')],
        ]),
        timestamp: createInstant(),
        deviceId,
      },
    ];
    const directCommit = await session.commit(setupEvents);
    expect(directCommit.ok).toBe(true);

    // Standalone view resolution without any Query
    const standaloneView = await client.views.resolveView({
      graphId,
      viewNodeId: 'view:standalone',
    });
    expect(standaloneView.ok).toBe(true);
    if (standaloneView.ok) {
      expect(standaloneView.value.view.bindingKind).toBe('standalone');
      expect(standaloneView.value.cycleDetected).toBe(false);
      expect(standaloneView.value.leafRenderer).toBe('system:markdown');
    }

    // Cycle detection on looping RenderSelector
    const cycledView = await client.views.resolveView({
      graphId,
      viewNodeId: 'view:cycle-a',
    });
    expect(cycledView.ok).toBe(true);
    if (cycledView.ok) {
      expect(cycledView.value.cycleDetected).toBe(true);
    }

    // Setting resolution cascade (shape override + schema default fallback)
    const setting = await client.views.resolveSetting({
      graphId,
      key: 'display-density',
      shapeId: 'shape:task',
    });
    expect(setting.ok).toBe(true);
    if (setting.ok) {
      expect(setting.value.found).toBe(true);
      expect(setting.value.resolvedScope).toBe('shape');
      expect(setting.value.valueJson).toBe('"compact"');
    }

    const defaultSetting = await client.views.resolveSetting({
      graphId,
      key: 'display-density',
    });
    expect(defaultSetting.ok).toBe(true);
    if (defaultSetting.ok) {
      expect(defaultSetting.value.found).toBe(true);
      expect(defaultSetting.value.resolvedScope).toBe('default');
      expect(defaultSetting.value.valueJson).toBe('"comfortable"');
    }

    // Bundles & Schema & Migrations
    const blockedInstall = await client.bundles.installBundle({
      graphId,
      bundle: {
        bundleId: 'bundle.beads.pro',
        name: 'Beads Pro',
        version: '1.0.0',
        shapeIds: [],
        queryNodeIds: [],
        viewNodeIds: [],
        pluginIds: [],
        activationKeyRequired: true,
      },
      provenance,
    });
    expect(blockedInstall.ok).toBe(false);
    if (!blockedInstall.ok) {
      expect(blockedInstall.error.category).toBe('FORBIDDEN');
    }

    const okInstall = await client.bundles.installBundle({
      graphId,
      bundle: {
        bundleId: 'bundle.beads',
        name: 'Beads',
        version: '1.0.0',
        shapeIds: [],
        queryNodeIds: [],
        viewNodeIds: [],
        pluginIds: [],
        activationKeyRequired: false,
      },
      provenance,
    });
    expect(okInstall.ok).toBe(true);

    const migration = await client.bundles.registerShapeMigration({
      graphId,
      fromShapeId: 'shape:task@1',
      toShapeId: 'shape:task@2',
      transformWasmRef: 'sha256:abc',
      provenance,
    });
    expect(migration.ok).toBe(true);

    const schema = await client.bundles.getSchema({ graphId });
    expect(schema.ok).toBe(true);
    if (schema.ok) {
      expect(schema.value.migrations.length).toBe(1);
    }

    // Streams replay and gap/overflow checks
    const replay = await client.streams.replayEvents({ graphId, afterCommitSeq: 0 });
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value.envelopes.length).toBeGreaterThanOrEqual(2);
    }

    const replayGap = await client.streams.replayEvents({
      graphId,
      afterCommitSeq: 0,
      maxReplayCount: 1,
    });
    expect(replayGap.ok).toBe(true);
    if (replayGap.ok) {
      expect(replayGap.value.envelopes[0]?.kind).toBe('gap');
    }

    const overflow = await client.streams.subscribeEvents({
      graphId,
      afterCommitSeq: 0,
      bufferCapacity: 1,
    });
    expect(overflow.ok).toBe(true);
    if (overflow.ok) {
      expect(overflow.value.envelopes[0]?.kind).toBe('overflow_disconnect');
    }
  });
});
