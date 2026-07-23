# Core GraphSession mutation handlers implementation plan

> **Change Context:** `openspec/changes/graph-api-architecture` (Task 3: Core GraphSession mutation handlers)

**Goal:** Implement core `GraphSession` write mutation handlers in `@canopy/api-adapter` for node creation, property updates, node deletion, edge creation, and edge deletion with schema validation, tenant ACL guards, optimistic concurrency CAS conflict handling, and structured error results.

**Architecture:** Extend `@canopy/api-adapter` payload definitions in `src/api-payloads.ts` and implement handler entrypoints in `src/mutation-handlers.ts`. Write operations validate `context.session` presence, enforce tenant boundary rules via `authContext.tenantId`, map input payloads into validated `@canopy/graph` domain entities/events, and commit them atomically to `EventLogStore` through `GraphSession.commit()`.

**Tech Stack:** TypeScript, `@canopy/graph`, `@canopy/api-adapter`, Bun test runner.

## Global Constraints

- All domain and payload types must have `readonly` properties.
- Function return types must use `Result<T, ApiAdapterError>`, never throw exceptions.
- Code style must follow one-sentence-per-line prose in docs and comments.
- No `any` or `Record<string, unknown>` unless strictly necessary.

---

### Task 1: Mutation request and response payload types in `@canopy/api-adapter`

**Files:**
- Modify: `packages/api-adapter/src/api-payloads.ts`
- Modify: `packages/api-adapter/tests/api-payloads.test.ts`
- Modify: `packages/api-adapter/src/index.ts`

**Interfaces:**
- Consumes: `NodeId`, `EdgeId`, `TypeId`, `PropertyValue` from `@canopy/graph`.
- Produces: `NodeCreatePayload`, `NodeUpdatePropertiesPayload`, `NodeDeletePayload`, `EdgeCreatePayload`, `EdgeDeletePayload`, `MutationResultPayload`.

- [ ] **Step 1: Write failing type validation tests for mutation payloads in `api-payloads.test.ts`**

Add unit tests verifying mutation request/response payload construction and export completeness.

```typescript
import type {
  NodeCreatePayload,
  NodeUpdatePropertiesPayload,
  NodeDeletePayload,
  EdgeCreatePayload,
  EdgeDeletePayload,
  MutationResultPayload,
} from '../src';
import { describe, expect, test } from 'bun:test';
import { createNodeId, createEdgeId, createTypeId } from '@canopy/graph';

describe('Mutation payload types', () => {
  test('constructs valid NodeCreatePayload', () => {
    const payload: NodeCreatePayload = {
      type: createTypeId('doc'),
      properties: { title: 'New Doc', tenantId: 't1' },
    };
    expect(payload.properties.title).toBe('New Doc');
  });

  test('constructs valid NodeUpdatePropertiesPayload', () => {
    const payload: NodeUpdatePropertiesPayload = {
      id: createNodeId('node-1'),
      properties: { title: 'Updated Title' },
      expectedSequence: 5,
    };
    expect(payload.id).toBe('node-1');
    expect(payload.expectedSequence).toBe(5);
  });

  test('constructs valid NodeDeletePayload', () => {
    const payload: NodeDeletePayload = {
      id: createNodeId('node-1'),
    };
    expect(payload.id).toBe('node-1');
  });

  test('constructs valid EdgeCreatePayload', () => {
    const payload: EdgeCreatePayload = {
      type: createTypeId('links'),
      source: createNodeId('node-1'),
      target: createNodeId('node-2'),
      properties: { weight: 1 },
    };
    expect(payload.source).toBe('node-1');
    expect(payload.target).toBe('node-2');
  });

  test('constructs valid EdgeDeletePayload', () => {
    const payload: EdgeDeletePayload = {
      id: createEdgeId('edge-1'),
    };
    expect(payload.id).toBe('edge-1');
  });

  test('constructs valid MutationResultPayload', () => {
    const payload: MutationResultPayload = {
      id: 'entity-1',
      success: true,
      affectedEventsCount: 1,
    };
    expect(payload.success).toBe(true);
    expect(payload.affectedEventsCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/api-payloads.test.ts`
Expected: FAIL with missing module exports `NodeCreatePayload`, `NodeUpdatePropertiesPayload`, etc.

- [ ] **Step 3: Implement mutation payload types in `api-payloads.ts` and re-export in `index.ts`**

In `packages/api-adapter/src/api-payloads.ts`:

```typescript
export type NodeCreatePayload = Readonly<{
  id?: NodeId;
  type: TypeId;
  properties: Readonly<Record<string, PropertyValue>>;
  expectedSequence?: number;
}>;

export type NodeUpdatePropertiesPayload = Readonly<{
  id: NodeId;
  properties: Readonly<Record<string, PropertyValue>>;
  expectedSequence?: number;
}>;

export type NodeDeletePayload = Readonly<{
  id: NodeId;
  expectedSequence?: number;
}>;

export type EdgeCreatePayload = Readonly<{
  id?: EdgeId;
  type: TypeId;
  source: NodeId;
  target: NodeId;
  properties?: Readonly<Record<string, PropertyValue>>;
  expectedSequence?: number;
}>;

export type EdgeDeletePayload = Readonly<{
  id: EdgeId;
  expectedSequence?: number;
}>;

export type MutationResultPayload = Readonly<{
  id: string;
  success: boolean;
  affectedEventsCount: number;
}>;
```

In `packages/api-adapter/src/index.ts`:

```typescript
export * from './api-context';
export * from './api-payloads';
export * from './query-handlers';
export * from './result-errors';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/api-payloads.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api-adapter/src/api-payloads.ts packages/api-adapter/src/index.ts packages/api-adapter/tests/api-payloads.test.ts
git commit -m "feat(api-adapter): define mutation request payloads and result types"
```

---

### Task 2: Implement core GraphSession mutation handlers in `@canopy/api-adapter`

**Files:**
- Create: `packages/api-adapter/src/mutation-handlers.ts`
- Modify: `packages/api-adapter/src/index.ts`
- Create: `packages/api-adapter/tests/mutation-handlers.test.ts`

**Interfaces:**
- Consumes: `ApiRequest`, `ApiResponse`, `ApiNodePayload`, `ApiEdgePayload`, `NodeCreatePayload`, `NodeUpdatePropertiesPayload`, `NodeDeletePayload`, `EdgeCreatePayload`, `EdgeDeletePayload`, `MutationResultPayload` from `./api-payloads`.
- Produces: `executeCreateNode`, `executeUpdateNodeProperties`, `executeDeleteNode`, `executeCreateEdge`, `executeDeleteEdge`.

- [ ] **Step 1: Write comprehensive failing tests in `mutation-handlers.test.ts`**

Cover node creation, property updates, node deletion, edge creation, edge deletion, missing `session` rejection, tenant ACL validation, referential integrity rejections, and schema errors.

```typescript
import { describe, expect, test } from 'bun:test';
import {
  createGraph,
  createNodeId,
  createEdgeId,
  createTypeId,
  createDeviceId,
  createGraphId,
  createGraphSession,
  createInMemoryEventLogStore,
} from '@canopy/graph';
import {
  createApiAdapterContext,
  createApiRequest,
  executeCreateNode,
  executeUpdateNodeProperties,
  executeDeleteNode,
  executeCreateEdge,
  executeDeleteEdge,
} from '../src';

const graphId = createGraphId('g1');
const deviceId = createDeviceId('device-1');

const setupSessionContext = async () => {
  const eventLogStore = createInMemoryEventLogStore();
  const session = createGraphSession(eventLogStore, graphId, deviceId);
  await session.load();
  return { session, eventLogStore };
};

describe('Mutation execution handlers', () => {
  test('fails if session is missing in ApiAdapterContext', async () => {
    const graph = createGraph(graphId, 'test').value;
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-1', context, {
      type: createTypeId('doc'),
      properties: { title: 'Test' },
    });

    const res = await executeCreateNode(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('VALIDATION_ERROR');
      expect(res.error.message).toContain('GraphSession is required');
    }
  });

  test('executeCreateNode successfully creates a node', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });
    const req = createApiRequest('req-2', context, {
      id: createNodeId('n1'),
      type: createTypeId('doc'),
      properties: { title: 'My Document', tenantId: 't1' },
    });

    const res = await executeCreateNode(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.id).toBe('n1');
      expect(res.value.properties.title).toBe('My Document');
    }
    expect(session.graph().nodes.has(createNodeId('n1'))).toBe(true);
  });

  test('executeCreateNode enforces tenantId match when authContext is set', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({
      graph: session.graph(),
      session,
      authContext: { tenantId: 't1' },
    });
    const req = createApiRequest('req-3', context, {
      id: createNodeId('n2'),
      type: createTypeId('doc'),
      properties: { title: 'Doc', tenantId: 't2' },
    });

    const res = await executeCreateNode(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('FORBIDDEN');
    }
  });

  test('executeUpdateNodeProperties updates existing node properties', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    await executeCreateNode(
      createApiRequest('req-4', context, {
        id: createNodeId('n3'),
        type: createTypeId('doc'),
        properties: { title: 'Original Title' },
      }),
    );

    const reqUpdate = createApiRequest('req-5', context, {
      id: createNodeId('n3'),
      properties: { title: 'Updated Title' },
    });

    const resUpdate = await executeUpdateNodeProperties(reqUpdate);
    expect(resUpdate.ok).toBe(true);
    if (resUpdate.ok) {
      expect(resUpdate.value.properties.title).toBe('Updated Title');
    }
  });

  test('executeUpdateNodeProperties fails with NOT_FOUND for non-existent node', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });
    const req = createApiRequest('req-6', context, {
      id: createNodeId('missing'),
      properties: { title: 'Title' },
    });

    const res = await executeUpdateNodeProperties(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeCreateEdge connects source and target nodes', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    await executeCreateNode(
      createApiRequest('req-7', context, {
        id: createNodeId('src'),
        type: createTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateNode(
      createApiRequest('req-8', context, {
        id: createNodeId('tgt'),
        type: createTypeId('doc'),
        properties: {},
      }),
    );

    const reqEdge = createApiRequest('req-9', context, {
      id: createEdgeId('e1'),
      type: createTypeId('links'),
      source: createNodeId('src'),
      target: createNodeId('tgt'),
      properties: { weight: 10 },
    });

    const resEdge = await executeCreateEdge(reqEdge);
    expect(resEdge.ok).toBe(true);
    if (resEdge.ok) {
      expect(resEdge.value.id).toBe('e1');
      expect(resEdge.value.source).toBe('src');
      expect(resEdge.value.target).toBe('tgt');
    }
  });

  test('executeCreateEdge fails if source node does not exist', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    const reqEdge = createApiRequest('req-10', context, {
      type: createTypeId('links'),
      source: createNodeId('missing-src'),
      target: createNodeId('tgt'),
    });

    const resEdge = await executeCreateEdge(reqEdge);
    expect(resEdge.ok).toBe(false);
    if (!resEdge.ok) {
      expect(resEdge.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeDeleteEdge removes an edge', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    await executeCreateNode(
      createApiRequest('req-11', context, {
        id: createNodeId('n11'),
        type: createTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateNode(
      createApiRequest('req-12', context, {
        id: createNodeId('n12'),
        type: createTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateEdge(
      createApiRequest('req-13', context, {
        id: createEdgeId('e13'),
        type: createTypeId('links'),
        source: createNodeId('n11'),
        target: createNodeId('n12'),
      }),
    );

    const reqDel = createApiRequest('req-14', context, { id: createEdgeId('e13') });
    const resDel = await executeDeleteEdge(reqDel);

    expect(resDel.ok).toBe(true);
    if (resDel.ok) {
      expect(resDel.value.success).toBe(true);
    }
    expect(session.graph().edges.has(createEdgeId('e13'))).toBe(false);
  });

  test('executeDeleteNode removes node and connected edges', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    await executeCreateNode(
      createApiRequest('req-15', context, {
        id: createNodeId('n15'),
        type: createTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateNode(
      createApiRequest('req-16', context, {
        id: createNodeId('n16'),
        type: createTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateEdge(
      createApiRequest('req-17', context, {
        id: createEdgeId('e17'),
        type: createTypeId('links'),
        source: createNodeId('n15'),
        target: createNodeId('n16'),
      }),
    );

    const reqDelNode = createApiRequest('req-18', context, { id: createNodeId('n15') });
    const resDelNode = await executeDeleteNode(reqDelNode);

    expect(resDelNode.ok).toBe(true);
    if (resDelNode.ok) {
      expect(resDelNode.value.success).toBe(true);
    }
    expect(session.graph().nodes.has(createNodeId('n15'))).toBe(false);
    expect(session.graph().edges.has(createEdgeId('e17'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/mutation-handlers.test.ts`
Expected: FAIL with missing module `../src/mutation-handlers`.

- [ ] **Step 3: Implement mutation execution handlers in `src/mutation-handlers.ts`**

Create `packages/api-adapter/src/mutation-handlers.ts`:

```typescript
import type { GraphEvent, NodeId, PropertyValue } from '@canopy/graph';
import {
  createEdgeId,
  createEventId,
  createInstant,
  createNodeId,
  err,
  ok,
} from '@canopy/graph';
import type {
  ApiEdgePayload,
  ApiNodePayload,
  ApiRequest,
  ApiResponse,
  EdgeCreatePayload,
  EdgeDeletePayload,
  MutationResultPayload,
  NodeCreatePayload,
  NodeDeletePayload,
  NodeUpdatePropertiesPayload,
} from './api-payloads';
import { createApiAdapterError } from './result-errors';

const convertPropertiesToMap = (
  props: Readonly<Record<string, PropertyValue>>,
): Map<string, PropertyValue> => new Map(Object.entries(props));

export const executeCreateNode = async (
  request: ApiRequest<NodeCreatePayload>,
): Promise<ApiResponse<ApiNodePayload>> => {
  const { session, authContext } = request.context;
  if (!session) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'GraphSession is required in ApiAdapterContext for write mutations',
      ),
    );
  }

  const { id, type, properties } = request.payload;
  const nodeId = id ?? createNodeId();

  if (authContext?.tenantId) {
    const payloadTenant = properties.tenantId;
    if (payloadTenant !== undefined && payloadTenant !== authContext.tenantId) {
      return err(
        createApiAdapterError(
          'FORBIDDEN',
          `Cannot create node for tenant '${payloadTenant}' under active tenant '${authContext.tenantId}'`,
        ),
      );
    }
  }

  const finalProperties: Record<string, PropertyValue> = {
    ...properties,
    ...(authContext?.tenantId && { tenantId: authContext.tenantId }),
  };

  const currentGraph = session.graph();
  if (currentGraph.nodes.has(nodeId)) {
    return err(
      createApiAdapterError('CONCURRENCY_CONFLICT', `Node with ID ${nodeId} already exists`),
    );
  }

  const eventId = createEventId();
  const now = createInstant();

  const event: GraphEvent = {
    type: 'NodeCreated',
    eventId,
    id: nodeId,
    nodeType: type,
    properties: convertPropertiesToMap(finalProperties),
    timestamp: now,
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const commitResult = await session.commit([event]);
  if (!commitResult.ok) {
    return err(createApiAdapterError('VALIDATION_ERROR', commitResult.error.message));
  }

  const updatedGraph = session.graph();
  const createdNode = updatedGraph.nodes.get(nodeId);
  if (!createdNode) {
    return err(createApiAdapterError('INTERNAL_ERROR', 'Node was not found post-commit'));
  }

  return ok({
    id: createdNode.id,
    type: createdNode.type,
    properties: Object.fromEntries(createdNode.properties.entries()),
    createdAt: createdNode.metadata.created,
    updatedAt: createdNode.metadata.modified,
  });
};

export const executeUpdateNodeProperties = async (
  request: ApiRequest<NodeUpdatePropertiesPayload>,
): Promise<ApiResponse<ApiNodePayload>> => {
  const { session, authContext } = request.context;
  if (!session) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'GraphSession is required in ApiAdapterContext for write mutations',
      ),
    );
  }

  const { id, properties } = request.payload;
  const currentGraph = session.graph();
  const existingNode = currentGraph.nodes.get(id);

  if (!existingNode) {
    return err(createApiAdapterError('NOT_FOUND', `Node with ID ${id} not found`));
  }

  if (authContext?.tenantId) {
    const existingTenant = existingNode.properties.get('tenantId');
    if (existingTenant !== authContext.tenantId) {
      return err(createApiAdapterError('NOT_FOUND', `Node with ID ${id} not found`));
    }
  }

  const changesMap = convertPropertiesToMap(properties);
  const event: GraphEvent = {
    type: 'NodePropertiesUpdated',
    eventId: createEventId(),
    id,
    changes: changesMap,
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const commitResult = await session.commit([event]);
  if (!commitResult.ok) {
    return err(createApiAdapterError('VALIDATION_ERROR', commitResult.error.message));
  }

  const updatedGraph = session.graph();
  const updatedNode = updatedGraph.nodes.get(id);
  if (!updatedNode) {
    return err(createApiAdapterError('INTERNAL_ERROR', 'Node was not found post-commit'));
  }

  return ok({
    id: updatedNode.id,
    type: updatedNode.type,
    properties: Object.fromEntries(updatedNode.properties.entries()),
    createdAt: updatedNode.metadata.created,
    updatedAt: updatedNode.metadata.modified,
  });
};

export const executeDeleteNode = async (
  request: ApiRequest<NodeDeletePayload>,
): Promise<ApiResponse<MutationResultPayload>> => {
  const { session, authContext } = request.context;
  if (!session) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'GraphSession is required in ApiAdapterContext for write mutations',
      ),
    );
  }

  const { id } = request.payload;
  const currentGraph = session.graph();
  const existingNode = currentGraph.nodes.get(id);

  if (!existingNode) {
    return err(createApiAdapterError('NOT_FOUND', `Node with ID ${id} not found`));
  }

  if (authContext?.tenantId) {
    const existingTenant = existingNode.properties.get('tenantId');
    if (existingTenant !== authContext.tenantId) {
      return err(createApiAdapterError('NOT_FOUND', `Node with ID ${id} not found`));
    }
  }

  const edgesToDelete = [...currentGraph.edges.values()].filter(
    (edge) => edge.source === id || edge.target === id,
  );

  const edgeEvents: GraphEvent[] = edgesToDelete.map((edge) => ({
    type: 'EdgeDeleted',
    eventId: createEventId(),
    id: edge.id,
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  }));

  const nodeEvent: GraphEvent = {
    type: 'NodeDeleted',
    eventId: createEventId(),
    id,
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const events: readonly GraphEvent[] = [nodeEvent, ...edgeEvents];
  const commitResult = await session.commit(events);
  if (!commitResult.ok) {
    return err(createApiAdapterError('VALIDATION_ERROR', commitResult.error.message));
  }

  return ok({
    id,
    success: true,
    affectedEventsCount: events.length,
  });
};

export const executeCreateEdge = async (
  request: ApiRequest<EdgeCreatePayload>,
): Promise<ApiResponse<ApiEdgePayload>> => {
  const { session, authContext } = request.context;
  if (!session) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'GraphSession is required in ApiAdapterContext for write mutations',
      ),
    );
  }

  const { id, type, source, target, properties = {} } = request.payload;
  const edgeId = id ?? createEdgeId();
  const currentGraph = session.graph();

  const sourceNode = currentGraph.nodes.get(source);
  const targetNode = currentGraph.nodes.get(target);

  if (!sourceNode) {
    return err(createApiAdapterError('NOT_FOUND', `Source node with ID ${source} not found`));
  }
  if (!targetNode) {
    return err(createApiAdapterError('NOT_FOUND', `Target node with ID ${target} not found`));
  }

  if (authContext?.tenantId) {
    if (sourceNode.properties.get('tenantId') !== authContext.tenantId) {
      return err(createApiAdapterError('NOT_FOUND', `Source node with ID ${source} not found`));
    }
    if (targetNode.properties.get('tenantId') !== authContext.tenantId) {
      return err(createApiAdapterError('NOT_FOUND', `Target node with ID ${target} not found`));
    }
  }

  if (currentGraph.edges.has(edgeId)) {
    return err(
      createApiAdapterError('CONCURRENCY_CONFLICT', `Edge with ID ${edgeId} already exists`),
    );
  }

  const event: GraphEvent = {
    type: 'EdgeCreated',
    eventId: createEventId(),
    id: edgeId,
    edgeType: type,
    source,
    target,
    properties: convertPropertiesToMap(properties),
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const commitResult = await session.commit([event]);
  if (!commitResult.ok) {
    return err(createApiAdapterError('VALIDATION_ERROR', commitResult.error.message));
  }

  const updatedGraph = session.graph();
  const createdEdge = updatedGraph.edges.get(edgeId);
  if (!createdEdge) {
    return err(createApiAdapterError('INTERNAL_ERROR', 'Edge was not found post-commit'));
  }

  return ok({
    id: createdEdge.id,
    type: createdEdge.type,
    source: createdEdge.source,
    target: createdEdge.target,
    properties: Object.fromEntries(createdEdge.properties.entries()),
  });
};

export const executeDeleteEdge = async (
  request: ApiRequest<EdgeDeletePayload>,
): Promise<ApiResponse<MutationResultPayload>> => {
  const { session, authContext } = request.context;
  if (!session) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'GraphSession is required in ApiAdapterContext for write mutations',
      ),
    );
  }

  const { id } = request.payload;
  const currentGraph = session.graph();
  const existingEdge = currentGraph.edges.get(id);

  if (!existingEdge) {
    return err(createApiAdapterError('NOT_FOUND', `Edge with ID ${id} not found`));
  }

  if (authContext?.tenantId) {
    const sourceNode = currentGraph.nodes.get(existingEdge.source);
    if (!sourceNode || sourceNode.properties.get('tenantId') !== authContext.tenantId) {
      return err(createApiAdapterError('NOT_FOUND', `Edge with ID ${id} not found`));
    }
  }

  const event: GraphEvent = {
    type: 'EdgeDeleted',
    eventId: createEventId(),
    id,
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const commitResult = await session.commit([event]);
  if (!commitResult.ok) {
    return err(createApiAdapterError('VALIDATION_ERROR', commitResult.error.message));
  }

  return ok({
    id,
    success: true,
    affectedEventsCount: 1,
  });
};
```

Export `mutation-handlers` in `packages/api-adapter/src/index.ts`:

```typescript
export * from './api-context';
export * from './api-payloads';
export * from './mutation-handlers';
export * from './query-handlers';
export * from './result-errors';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/mutation-handlers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api-adapter/src/mutation-handlers.ts packages/api-adapter/src/index.ts packages/api-adapter/tests/mutation-handlers.test.ts
git commit -m "feat(api-adapter): implement core GraphSession mutation execution handlers"
```

---

### Task 3: Quality gates and full verification

**Files:**
- None (verification phase across workspace)

- [ ] **Step 1: Build all packages**

Run: `bun run build`
Expected: Clean build across workspace.

- [ ] **Step 2: Lint codebase**

Run: `bun run lint`
Expected: Clean pass with no functional/immutable/eslint errors.

- [ ] **Step 3: Typecheck codebase**

Run: `bun run typecheck`
Expected: Zero TypeScript errors.

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: All tests pass cleanly.

- [ ] **Step 5: Commit and verification state**

Verify `git status` is clean.
