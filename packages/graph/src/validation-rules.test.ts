import { describe, it, expect } from 'bun:test';
import fc from 'fast-check';
import {
  SYSTEM_IDS,
  asDeviceId,
  asEdgeId,
  asEventId,
  asGraphId,
  asInstant,
  asNodeId,
  asPropertyTypeId,
  asShapeId,
  createGraph,
  createGraphId,
  createInstant,
  createPropertyType,
  createShape,
  decodeStoredEvent,
  getGraphAt,
  ok,
  unwrap,
  validateEdge,
  validateNode,
  type Edge,
  type EventLogStore,
  type GraphEvent,
  type Node,
  type PropertyValue,
} from './index';
import { addNode } from './ops/node';

const DEVICE_ID = asDeviceId('00000000-0000-0000-0000-000000000000');
const OPTIONS = { deviceId: DEVICE_ID };

function createTestEventLog(): EventLogStore {
  const events: GraphEvent[] = [];
  return {
    appendEvents: (_graphId, newEvents) => {
      for (const event of newEvents) {
        events.push(event);
      }
      events.sort((a, b) => a.eventId.localeCompare(b.eventId));
      return Promise.resolve(ok(undefined));
    },
    getEvents: (_graphId, options) => {
      const filtered = events.filter(
        (event) =>
          (options?.after === undefined || event.eventId > options.after) &&
          (options?.before === undefined || event.eventId < options.before),
      );
      const ordered = options?.reverse ? filtered.toReversed() : filtered;
      const decoded = ordered
        .map((raw) => decodeStoredEvent(raw))
        .flatMap((result) => (result.ok && result.value !== null ? [result.value] : []));
      return Promise.resolve(
        ok(options?.limit === undefined ? decoded : decoded.slice(0, options.limit)),
      );
    },
  };
}

function baseNode(
  id: string,
  shape: ReturnType<typeof asShapeId> | undefined,
  properties: Readonly<Record<string, PropertyValue>>,
): Node {
  return {
    id: asNodeId(id),
    ...(shape !== undefined && { shape }),
    properties: new Map(Object.entries(properties)),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: DEVICE_ID,
    },
  };
}

function baseEdge(
  id: string,
  shape: ReturnType<typeof asShapeId> | undefined,
  source: string,
  target: string,
): Edge {
  return {
    id: asEdgeId(id),
    ...(shape !== undefined && { shape }),
    source: asNodeId(source),
    target: asNodeId(target),
    properties: new Map(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: DEVICE_ID,
    },
  };
}

describe('Validation Rules 1-16', () => {
  it('Rule 1-3: open entities skip, missing shape errors, kind mismatch errors', () => {
    const graph = unwrap(createGraph(createGraphId(), 'Rules'));

    expect(validateNode(graph, baseNode('open-1', undefined, { anything: 1 })).valid).toBe(true);
    expect(validateEdge(graph, baseEdge('open-e', undefined, 'a', 'b')).valid).toBe(true);

    const missing = validateNode(graph, baseNode('missing-1', asShapeId('missing:shape'), {}));
    expect(missing.valid).toBe(false);
    expect(missing.errors[0]?.code).toBe('SHAPE_NOT_FOUND');
    expect(missing.errors[0]?.entityKind).toBe('node');
    expect(missing.errors[0]?.entityId).toBe(asNodeId('missing-1'));

    const wrongKind = validateNode(
      graph,
      baseNode('wrong-kind', SYSTEM_IDS.EDGE_DERIVED_FROM as never, {}),
    );
    expect(wrongKind.valid).toBe(false);
    expect(wrongKind.errors[0]?.code).toBe('SHAPE_KIND_MISMATCH');

    const edgeWithNodeShape = validateEdge(
      graph,
      baseEdge('edge-wrong-kind', SYSTEM_IDS.PROXY, 'a', 'b'),
    );
    expect(edgeWithNodeShape.valid).toBe(false);
    expect(edgeWithNodeShape.errors[0]?.code).toBe('SHAPE_KIND_MISMATCH');
    expect(edgeWithNodeShape.errors[0]?.entityKind).toBe('edge');
  });

  it('Rule 4: SHAPE_INACTIVE is error on create and warning on update', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Inactive'));
    graph = unwrap(
      addNode(
        graph,
        baseNode('shape:inactive', SYSTEM_IDS.SHAPE, {
          name: 'InactiveShape',
          namespace: 'user',
          entityKind: 'node',
          status: 'inactive',
        }),
        OPTIONS,
      ),
    ).graph;

    const candidate = baseNode('n1', asShapeId('shape:inactive'), {});
    const onCreate = validateNode(graph, candidate, 'create');
    expect(onCreate.valid).toBe(false);
    expect(onCreate.errors[0]?.code).toBe('SHAPE_INACTIVE');
    expect(onCreate.errors[0]?.severity).toBe('error');

    const onUpdate = validateNode(graph, candidate, 'update', candidate);
    expect(onUpdate.valid).toBe(true);
    expect(onUpdate.warnings[0]?.code).toBe('SHAPE_INACTIVE');
    expect(onUpdate.warnings[0]?.severity).toBe('warning');
  });

  it('Rule 5-9: PropertyType reference, cardinality widening, required, and closed shapes', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Closed'));
    const propertyTypeResult = unwrap(
      createPropertyType(
        graph,
        { name: 'count', namespace: 'user', valueKind: 'integer', cardinality: 'one' },
        OPTIONS,
      ),
    );
    graph = propertyTypeResult.graph;
    const ptId = asPropertyTypeId(
      graph.nodes.values().find((node) => node.properties.get('name') === 'count')?.id ?? '',
    );

    const shapeResult = unwrap(
      createShape(
        graph,
        {
          name: 'StrictItem',
          namespace: 'user',
          entityKind: 'node',
          closed: true,
          properties: [{ kind: 'reference', propertyTypeId: ptId, required: true }],
        },
        OPTIONS,
      ),
    );
    graph = shapeResult.graph;
    const shapeId = asShapeId(
      graph.nodes.values().find((node) => node.properties.get('name') === 'StrictItem')?.id ?? '',
    );

    // Rule 6: widening one -> many rejected in createShape
    const widenResult = createShape(
      graph,
      {
        name: 'Widened',
        namespace: 'user',
        entityKind: 'node',
        properties: [
          { kind: 'reference', propertyTypeId: ptId, required: false, cardinality: 'many' },
        ],
      },
      OPTIONS,
    );
    expect(widenResult.ok).toBe(false);
    if (!widenResult.ok) expect(widenResult.error.code).toBe('CARDINALITY_WIDENED');

    // Rule 7 & 8: missing required + undeclared property on closed shape
    const badNode = baseNode('item-1', shapeId, { extra: 'not-allowed' });
    const validationResult = validateNode(graph, badNode);
    expect(validationResult.valid).toBe(false);
    expect(validationResult.errors.map((issue) => issue.code)).toContain('REQUIRED_MISSING');
    expect(validationResult.errors.map((issue) => issue.code)).toContain('UNDECLARED_PROPERTY');

    // Rule 5: dangling PropertyType reference
    graph = unwrap(
      addNode(
        graph,
        baseNode('shape:dangling', SYSTEM_IDS.SHAPE, {
          name: 'Dangling',
          namespace: 'user',
          entityKind: 'node',
          properties: JSON.stringify([
            { kind: 'reference', name: 'x', required: true, propertyTypeId: 'pt:missing' },
          ]),
        }),
        OPTIONS,
      ),
    ).graph;
    const danglingResult = validateNode(graph, baseNode('d1', asShapeId('shape:dangling'), {}));
    expect(danglingResult.errors[0]?.code).toBe('PROPERTY_TYPE_NOT_FOUND');
  });

  it('Rule 10-13: integer, url, unique, ref target, and ReDoS rejection', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Constraints'));
    const shapeResult = unwrap(
      createShape(
        graph,
        {
          name: 'Record',
          namespace: 'user',
          entityKind: 'node',
          properties: [
            { kind: 'inline', name: 'qty', valueKind: 'integer', required: false, min: 0 },
            { kind: 'inline', name: 'link', valueKind: 'url', required: false },
            {
              kind: 'inline',
              name: 'tags',
              valueKind: 'text',
              required: false,
              cardinality: 'many',
              unique: true,
            },
            {
              kind: 'inline',
              name: 'target',
              valueKind: 'reference',
              required: false,
              targetShapeId: SYSTEM_IDS.PROXY,
            },
          ],
        },
        OPTIONS,
      ),
    );
    graph = shapeResult.graph;
    const shapeId = asShapeId(
      graph.nodes.values().find((node) => node.properties.get('name') === 'Record')?.id ?? '',
    );

    const invalid = validateNode(
      graph,
      baseNode('rec-1', shapeId, {
        qty: 1.5,
        link: 'javascript:alert(1)',
        tags: ['a', 'a'],
        target: SYSTEM_IDS.NAMESPACE_USER,
      }),
    );
    expect(invalid.valid).toBe(false);
    const codes = invalid.errors.map((issue) => issue.code);
    expect(codes).toContain('CONSTRAINT');
    expect(codes).toContain('DUPLICATE_VALUE');
    expect(codes).toContain('REF_TARGET');

    // ReDoS nested quantifier rejected in createShape
    const redosShape = createShape(
      graph,
      {
        name: 'ReDoSShape',
        namespace: 'user',
        entityKind: 'node',
        properties: [
          { kind: 'inline', name: 'pat', valueKind: 'text', required: false, regex: '(a+)+' },
        ],
      },
      OPTIONS,
    );
    expect(redosShape.ok).toBe(false);
    if (!redosShape.ok) expect(redosShape.error.code).toBe('CONSTRAINT');
  });

  it('Rule 15 & 16: plugin system exemption and Shape entityKind immutability', () => {
    const graph = unwrap(createGraph(createGraphId(), 'Meta'));

    // System plugin with empty placeholder wasm_binary is exempt
    const sysPlugin = baseNode('system:plugin:builtin', SYSTEM_IDS.TYPE_PLUGIN, {
      wasm_binary: '',
      manifest: JSON.stringify({ name: 'Builtin', version: '1.0.0', capabilities: ['read:nodes'] }),
      version: '1.0.0',
    });
    expect(validateNode(graph, sysPlugin).valid).toBe(true);

    // Non-system plugin with empty wasm_binary fails
    const userPlugin = baseNode('user-plugin-1', SYSTEM_IDS.TYPE_PLUGIN, {
      wasm_binary: '',
      manifest: JSON.stringify({ name: 'User', version: '1.0.0', capabilities: ['read:nodes'] }),
      version: '1.0.0',
    });
    expect(validateNode(graph, userPlugin).errors.some((issue) => issue.code === 'PLUGIN')).toBe(
      true,
    );

    // Rule 16: cannot mutate Shape.entityKind on update
    const previousShape = baseNode('shape:x', SYSTEM_IDS.SHAPE, {
      name: 'X',
      namespace: 'user',
      entityKind: 'node',
    });
    const nextShape = baseNode('shape:x', SYSTEM_IDS.SHAPE, {
      name: 'X',
      namespace: 'user',
      entityKind: 'edge',
    });
    const metaResult = validateNode(graph, nextShape, 'update', previousShape);
    expect(metaResult.valid).toBe(false);
    expect(metaResult.errors.some((issue) => issue.code === 'SHAPE_MALFORMED')).toBe(true);
  });

  it('getGraphAt replays retired meta-node events and Bead-a Shape events cleanly', async () => {
    const store = createTestEventLog();
    const graphId = asGraphId('00000000-0000-4000-8000-000000000099');
    const event1 = asEventId('01900000-0000-7000-8000-000000000001');
    const event2 = asEventId('01900000-0000-7000-8000-000000000002');
    const event3 = asEventId('01900000-0000-7000-8000-000000000003');
    const ts = asInstant('2026-01-01T00:00:00.000Z');

    // Append legacy retired meta-node events + a legacy NodeType instance
    await store.appendEvents(graphId, [
      {
        type: 'NodeCreated',
        eventId: event1,
        id: asNodeId('node:type:node-type'),
        shapeId: asShapeId('node:type:node-type'),
        properties: new Map([['name', 'Node Type']]),
        timestamp: ts,
        deviceId: DEVICE_ID,
      },
      {
        type: 'NodeCreated',
        eventId: event2,
        id: asNodeId('user:shape:note'),
        shapeId: asShapeId('node:type:node-type'),
        properties: new Map<string, PropertyValue>([
          ['name', 'Note'],
          ['namespace', 'user'],
        ]),
        timestamp: ts,
        deviceId: DEVICE_ID,
      },
      {
        type: 'NodeDeleted',
        eventId: event3,
        id: asNodeId('node:type:edge-type'),
        timestamp: ts,
        deviceId: DEVICE_ID,
      },
    ]);

    const replayed = await getGraphAt(store, graphId, { eventId: event3 });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;

    const noteShape = replayed.value.nodes.get(asNodeId('user:shape:note'));
    expect(noteShape?.shape).toBe(SYSTEM_IDS.SHAPE);
    expect(noteShape?.properties.get('entityKind')).toBe('node');
    expect(replayed.value.nodes.has(SYSTEM_IDS.SHAPE_DEF)).toBe(true);
  });

  it('fast-check property tests: closed: false extras, single mutations, and warnings', () => {
    const baseGraph = unwrap(createGraph(createGraphId(), 'PBT'));
    const shapeResult = unwrap(
      createShape(
        baseGraph,
        {
          name: 'PbtNode',
          namespace: 'user',
          entityKind: 'node',
          closed: false,
          properties: [
            { kind: 'inline', name: 'count', valueKind: 'integer', required: true, min: 0 },
            { kind: 'inline', name: 'site', valueKind: 'url', required: false },
          ],
        },
        OPTIONS,
      ),
    );
    const graph = shapeResult.graph;
    const shapeId = asShapeId(
      graph.nodes.values().find((node) => node.properties.get('name') === 'PbtNode')?.id ?? '',
    );

    fc.assert(
      fc.property(
        fc.nat(1000),
        fc.string({ minLength: 1, maxLength: 20 }).filter((k) => k !== 'count' && k !== 'site'),
        fc.string(),
        (count, extraKey, extraValue) => {
          const validNode = baseNode('pbt-1', shapeId, {
            count,
            site: 'https://example.com/item',
            [extraKey]: extraValue,
          });
          expect(validateNode(graph, validNode).valid).toBe(true);

          // Single mutation: negative integer violates min: 0
          const invalidNode = baseNode('pbt-2', shapeId, { count: -1 - count });
          const invalidResult = validateNode(graph, invalidNode);
          expect(invalidResult.valid).toBe(false);
          expect(invalidResult.errors.some((issue) => issue.code === 'CONSTRAINT')).toBe(true);
        },
      ),
      { numRuns: 30 },
    );

    // Warnings property check: edge endpoint mismatch never invalidates
    const edgeShapeResult = unwrap(
      createShape(
        graph,
        {
          name: 'PbtEdge',
          namespace: 'user',
          entityKind: 'edge',
          properties: [],
          sourceTypes: [SYSTEM_IDS.PROXY],
        },
        OPTIONS,
      ),
    );
    const edgeGraph = edgeShapeResult.graph;
    const edgeShapeId = asShapeId(
      edgeGraph.nodes.values().find((node) => node.properties.get('name') === 'PbtEdge')?.id ?? '',
    );
    const openSource = baseNode('open-src', undefined, {});
    const openTarget = baseNode('open-tgt', undefined, {});
    const withEndpoints = unwrap(
      addNode(unwrap(addNode(edgeGraph, openSource, OPTIONS)).graph, openTarget, OPTIONS),
    ).graph;
    const edgeResult = validateEdge(
      withEndpoints,
      baseEdge('e-warn', edgeShapeId, 'open-src', 'open-tgt'),
    );
    expect(edgeResult.valid).toBe(true);
    expect(edgeResult.warnings.some((warning) => warning.code === 'EDGE_ENDPOINT_SHAPE')).toBe(
      true,
    );
  });
});
