import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  addEdge,
  addNode,
  asEdgeId,
  asGraphId,
  asNodeId,
  asTypeId,
  createGraph,
  createInstant,
  SYSTEM_DEVICE_ID,
  SYSTEM_EDGE_TYPES,
  SYSTEM_IDS,
  unwrap,
  type Edge,
  type Graph,
  type Node,
  type PropertyValue,
} from '@canopy/graph';
import { BlockRenderer } from '../../../src/components/renderers/block-renderer';
import { setRenderGrantForPlugin } from '../../../src/components/renderers/render-grants';

const fixtureCaseValues = [
  'missing',
  'empty',
  'unknown',
  'worker-load',
  'raw-only',
  'raw-interactive-missing',
  'wildcard',
  'valid',
] as const;
type FixtureCase = (typeof fixtureCaseValues)[number];
const fixtureCases: ReadonlySet<string> = new Set(fixtureCaseValues);

const isFixtureCase = (value: string): value is FixtureCase => fixtureCases.has(value);

const readCase = (parameters: Readonly<Pick<URLSearchParams, 'get'>>): FixtureCase => {
  const value = parameters.get('case');
  if (value !== null && isFixtureCase(value)) {
    return value;
  }
  return 'missing';
};

const addFixtureNode = (graph: Graph, node: Node): Graph =>
  unwrap(addNode(graph, node, { deviceId: SYSTEM_DEVICE_ID })).graph;

const addFixtureEdge = (graph: Graph, edge: Edge): Graph =>
  unwrap(addEdge(graph, edge, { deviceId: SYSTEM_DEVICE_ID })).graph;

const fixtureNode = (
  id: string,
  type: string,
  properties: ReadonlyMap<string, PropertyValue>,
): Node => ({
  id: asNodeId(id),
  type: asTypeId(type),
  properties,
  metadata: {
    created: createInstant(),
    modified: createInstant(),
    modifiedBy: SYSTEM_DEVICE_ID,
  },
});

const buildFixture = (
  fixtureCase: FixtureCase,
  nodeSuffix: string,
): Readonly<{ graph: Graph; node: Node; pluginId: string }> => {
  const graphId = `fixture-renderer-${nodeSuffix}`;
  const nodeId = `fixture:node:${nodeSuffix}`;
  const typeId = `fixture:type:${nodeSuffix}`;
  const viewId = `fixture:view:${nodeSuffix}`;
  const rendererId = `fixture:renderer:${nodeSuffix}`;
  const pluginId = `fixture:plugin:${nodeSuffix}`;
  const guestId =
    fixtureCase === 'missing' || fixtureCase === 'raw-interactive-missing'
      ? undefined
      : fixtureCase === 'empty'
        ? ''
        : fixtureCase === 'unknown'
          ? 'fixture:does-not-exist'
          : 'fixture:interactive';
  const grant =
    fixtureCase === 'wildcard'
      ? 'render:*'
      : fixtureCase === 'raw-only'
        ? 'render:raw-html'
        : fixtureCase === 'raw-interactive-missing'
          ? 'render:raw-html render:interactive'
          : 'render:interactive';
  const manifestCapabilities =
    fixtureCase === 'raw-only' || fixtureCase === 'raw-interactive-missing'
      ? ['render:raw-html', 'render:interactive']
      : ['render:interactive'];
  const contentNode = fixtureNode(
    nodeId,
    typeId,
    new Map([
      ['content', '# Fixture renderer content'],
      ['label', `renderer fixture ${fixtureCase}`],
      ['namespace', 'fixture'],
    ]),
  );
  const viewNode = fixtureNode(
    viewId,
    SYSTEM_IDS.VIEW_DEFINITION,
    new Map([['name', `Renderer unavailable fixture ${fixtureCase}`]]),
  );
  const rendererNode = fixtureNode(
    rendererId,
    SYSTEM_IDS.RENDERER,
    new Map([
      ['rendererKind', 'wasm'],
      ['entryPoint', pluginId],
    ]),
  );
  const pluginProperties = new Map<string, PropertyValue>(
    guestId === undefined
      ? [['manifest', JSON.stringify({ capabilities: manifestCapabilities })]]
      : [
          ['manifest', JSON.stringify({ capabilities: manifestCapabilities })],
          ['workerGuestId', guestId],
        ],
  );
  const pluginNode = fixtureNode(pluginId, 'canopy:system/plugin', pluginProperties);
  const initialGraph = unwrap(createGraph(asGraphId(graphId), 'Renderer unavailable fixture'));
  const graphWithNodes = addFixtureNode(
    addFixtureNode(
      addFixtureNode(addFixtureNode(initialGraph, contentNode), viewNode),
      rendererNode,
    ),
    pluginNode,
  );
  const graph = addFixtureEdge(
    addFixtureEdge(graphWithNodes, {
      id: asEdgeId(`fixture:edge:override:${nodeSuffix}`),
      type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
      source: contentNode.id,
      target: viewNode.id,
      properties: new Map(),
      metadata: contentNode.metadata,
    }),
    {
      id: asEdgeId(`fixture:edge:renderer:${nodeSuffix}`),
      type: SYSTEM_EDGE_TYPES.USES_RENDERER,
      source: viewNode.id,
      target: rendererNode.id,
      properties: new Map(),
      metadata: viewNode.metadata,
    },
  );
  setRenderGrantForPlugin(pluginId, grant);
  return { graph, node: contentNode, pluginId };
};

const parameters = new URLSearchParams(location.search);
const fixtureCase = readCase(parameters);
const nodeSuffix = parameters.get('node') ?? crypto.randomUUID();
const fixture = buildFixture(fixtureCase, nodeSuffix);
const rootElement = document.querySelector('#root');
if (rootElement !== null) {
  createRoot(rootElement).render(
    <main
      data-testid="renderer-fixture"
      data-fixture-case={fixtureCase}
      data-node-id={fixture.node.id}
    >
      <div data-testid="host-sentinel">untouched</div>
      <BlockRenderer node={fixture.node} graph={fixture.graph} />
    </main>,
  );
}
