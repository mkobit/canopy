import { describe, it, expect } from 'bun:test';
import { createGraph } from './create-graph';
import { asGraphId, asNodeId, unwrap } from '@canopy/graph';
import type { NodeId } from '@canopy/graph';
import { SYSTEM_IDS } from './system';
import { getNodeTypes, getEdgeTypes, getNodeType } from './queries';
import { parseNamespace } from './resolve-namespace';
import { RESTRICTED_NAMESPACE_KINDS } from './namespace';
import { bootstrap } from './bootstrap';

describe('Meta-circular bootstrap', () => {
  it('creates a graph with system nodes', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    // Check NodeType definition
    const nodeTypeDef = graph.nodes.get(SYSTEM_IDS.NODE_TYPE_DEF);
    expect(nodeTypeDef).toBeDefined();
    expect(nodeTypeDef?.type).toBe(SYSTEM_IDS.NODE_TYPE);
    expect(nodeTypeDef?.properties.get('name')).toEqual('Node Type');
    expect(nodeTypeDef?.properties.get('namespace')).toEqual('system');

    // Check EdgeType definition
    const edgeTypeDef = graph.nodes.get(SYSTEM_IDS.EDGE_TYPE_DEF);
    expect(edgeTypeDef).toBeDefined();
    expect(edgeTypeDef?.type).toBe(SYSTEM_IDS.NODE_TYPE); // EdgeType definition is a NodeType
    expect(edgeTypeDef?.properties.get('name')).toEqual('Edge Type');
    expect(edgeTypeDef?.properties.get('namespace')).toEqual('system');

    // Check Renderer definition
    const rendererDef = graph.nodes.get(SYSTEM_IDS.RENDERER_DEF);
    expect(rendererDef).toBeDefined();
    expect(rendererDef?.type).toBe(SYSTEM_IDS.NODE_TYPE);
    expect(rendererDef?.properties.get('name')).toEqual('Renderer');
    expect(rendererDef?.properties.get('namespace')).toEqual('system');

    // Check Namespace definition (self-describing metatype for the Namespace node shape)
    const namespaceDef = graph.nodes.get(SYSTEM_IDS.NAMESPACE_DEF);
    expect(namespaceDef).toBeDefined();
    expect(namespaceDef?.type).toBe(SYSTEM_IDS.NODE_TYPE);
    expect(namespaceDef?.properties.get('name')).toEqual('Namespace');
    expect(namespaceDef?.properties.get('namespace')).toEqual('system');
    expect(
      JSON.parse(namespaceDef?.properties.get('properties') as string).map(
        (p: { name: string }) => p.name,
      ),
    ).toEqual(['name', 'description', 'kind']);

    // Check migrated Namespace instance nodes
    const systemNs = graph.nodes.get(SYSTEM_IDS.NAMESPACE_SYSTEM);
    expect(systemNs).toBeDefined();
    expect(systemNs?.type).toBe(SYSTEM_IDS.NAMESPACE);
    expect(systemNs?.properties.get('name')).toEqual('system');
    expect(systemNs?.properties.get('kind')).toEqual('system');

    const userNs = graph.nodes.get(SYSTEM_IDS.NAMESPACE_USER);
    expect(userNs).toBeDefined();
    expect(userNs?.type).toBe(SYSTEM_IDS.NAMESPACE);
    expect(userNs?.properties.get('name')).toEqual('user');

    const importedNs = graph.nodes.get(SYSTEM_IDS.NAMESPACE_IMPORTED);
    expect(importedNs).toBeDefined();
    expect(importedNs?.type).toBe(SYSTEM_IDS.NAMESPACE);
    expect(importedNs?.properties.get('name')).toEqual('imported');

    const userSettingsNs = graph.nodes.get(SYSTEM_IDS.NAMESPACE_USER_SETTINGS);
    expect(userSettingsNs).toBeDefined();
    expect(userSettingsNs?.type).toBe(SYSTEM_IDS.NAMESPACE);
    expect(userSettingsNs?.properties.get('name')).toEqual('user-settings');

    // Check PropertyType definition
    const propertyTypeDef = graph.nodes.get(SYSTEM_IDS.PROPERTY_TYPE_DEF);
    expect(propertyTypeDef).toBeDefined();
    expect(propertyTypeDef?.type).toBe(SYSTEM_IDS.NODE_TYPE);
    expect(propertyTypeDef?.properties.get('name')).toEqual('Property Type');
    expect(propertyTypeDef?.properties.get('namespace')).toEqual('system');
    expect(
      JSON.parse(propertyTypeDef?.properties.get('properties') as string).map(
        (p: { name: string }) => p.name,
      ),
    ).toEqual(['name', 'valueKind', 'description']);

    // Check Core Edge Types
    const childOf = graph.nodes.get(SYSTEM_IDS.EDGE_CHILD_OF);
    expect(childOf).toBeDefined();
    expect(childOf?.type).toBe(SYSTEM_IDS.EDGE_TYPE);
    expect(childOf?.properties.get('name')).toEqual('Child Of');
    expect(childOf?.properties.get('namespace')).toEqual('system');

    // Check Settings schemas
    const settingsSchemaDef = graph.nodes.get(SYSTEM_IDS.SETTINGS_SCHEMA_DEF);
    expect(settingsSchemaDef).toBeDefined();
    expect(settingsSchemaDef?.type).toBe(SYSTEM_IDS.NODE_TYPE);

    const userSettingDef = graph.nodes.get(SYSTEM_IDS.USER_SETTING_DEF);
    expect(userSettingDef).toBeDefined();
    expect(userSettingDef?.type).toBe(SYSTEM_IDS.NODE_TYPE);

    const defaultView = graph.nodes.get(SYSTEM_IDS.SETTING_DEFAULT_VIEW);
    expect(defaultView).toBeDefined();
    expect(defaultView?.type).toBe(SYSTEM_IDS.SETTINGS_SCHEMA);
    expect(defaultView?.properties.get('key')).toBe('default-view');

    const displayDensity = graph.nodes.get(SYSTEM_IDS.SETTING_DISPLAY_DENSITY);
    expect(displayDensity).toBeDefined();
    expect(displayDensity?.type).toBe(SYSTEM_IDS.SETTINGS_SCHEMA);
  });

  it('seeds renderers, view definitions, and default view mappings', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    // Check system edge types definitions
    const usesRendererDef = graph.nodes.get(SYSTEM_IDS.EDGE_USES_RENDERER);
    expect(usesRendererDef).toBeDefined();
    expect(usesRendererDef?.type).toBe(SYSTEM_IDS.EDGE_TYPE);
    expect(usesRendererDef?.properties.get('name')).toBe('uses_renderer');

    const viewOverrideDef = graph.nodes.get(SYSTEM_IDS.EDGE_VIEW_OVERRIDE);
    expect(viewOverrideDef).toBeDefined();
    expect(viewOverrideDef?.type).toBe(SYSTEM_IDS.EDGE_TYPE);
    expect(viewOverrideDef?.properties.get('name')).toBe('view_override');

    const defaultViewEdgeDef = graph.nodes.get(SYSTEM_IDS.EDGE_DEFAULT_VIEW);
    expect(defaultViewEdgeDef).toBeDefined();
    expect(defaultViewEdgeDef?.type).toBe(SYSTEM_IDS.EDGE_TYPE);
    expect(defaultViewEdgeDef?.properties.get('name')).toBe('default_view');

    // Check system Renderers
    const textRenderer = graph.nodes.get(asNodeId('system:renderer:text'));
    expect(textRenderer).toBeDefined();
    expect(textRenderer?.type).toBe(SYSTEM_IDS.RENDERER);
    expect(textRenderer?.properties.get('name')).toBe('Text Renderer');
    expect(textRenderer?.properties.get('rendererKind')).toBe('system');
    expect(textRenderer?.properties.get('entryPoint')).toBe('system:text');
    expect(textRenderer?.properties.get('permissions')).toEqual([]);

    const codeRenderer = graph.nodes.get(asNodeId('system:renderer:code'));
    expect(codeRenderer).toBeDefined();
    expect(codeRenderer?.type).toBe(SYSTEM_IDS.RENDERER);
    expect(codeRenderer?.properties.get('name')).toBe('Code Renderer');
    expect(codeRenderer?.properties.get('rendererKind')).toBe('system');
    expect(codeRenderer?.properties.get('entryPoint')).toBe('system:code');
    expect(codeRenderer?.properties.get('permissions')).toEqual([]);

    const mdRenderer = graph.nodes.get(asNodeId('system:renderer:markdown'));
    expect(mdRenderer).toBeDefined();
    expect(mdRenderer?.type).toBe(SYSTEM_IDS.RENDERER);
    expect(mdRenderer?.properties.get('name')).toBe('Markdown Renderer');
    expect(mdRenderer?.properties.get('rendererKind')).toBe('system');
    expect(mdRenderer?.properties.get('entryPoint')).toBe('system:markdown');
    expect(mdRenderer?.properties.get('permissions')).toEqual([]);

    // Check system ViewDefinitions
    const textView = graph.nodes.get(asNodeId('system:view:text-block'));
    expect(textView).toBeDefined();
    expect(textView?.type).toBe(SYSTEM_IDS.VIEW_DEFINITION);
    expect(textView?.properties.get('name')).toBe('Text Block View');
    expect(textView?.properties.get('layout')).toBe('document');

    const codeView = graph.nodes.get(asNodeId('system:view:code-block'));
    expect(codeView).toBeDefined();
    expect(codeView?.type).toBe(SYSTEM_IDS.VIEW_DEFINITION);
    expect(codeView?.properties.get('name')).toBe('Code Block View');
    expect(codeView?.properties.get('layout')).toBe('document');

    const mdView = graph.nodes.get(asNodeId('system:view:markdown'));
    expect(mdView).toBeDefined();
    expect(mdView?.type).toBe(SYSTEM_IDS.VIEW_DEFINITION);
    expect(mdView?.properties.get('name')).toBe('Markdown View');
    expect(mdView?.properties.get('layout')).toBe('document');

    // Helper to find edge by type, source, target
    const findEdge = (type: string, source: string, target: string) => {
      return [...graph.edges.values()].find(
        (e) => e.type === type && e.source === source && e.target === target,
      );
    };

    // Check uses_renderer edges
    expect(
      findEdge('system:edgetype:uses-renderer', 'system:view:text-block', 'system:renderer:text'),
    ).toBeDefined();
    expect(
      findEdge('system:edgetype:uses-renderer', 'system:view:code-block', 'system:renderer:code'),
    ).toBeDefined();
    expect(
      findEdge('system:edgetype:uses-renderer', 'system:view:markdown', 'system:renderer:markdown'),
    ).toBeDefined();

    // Check default_view edges
    expect(
      findEdge(
        'system:edgetype:default-view',
        'system:nodetype:text-block',
        'system:view:text-block',
      ),
    ).toBeDefined();
    expect(
      findEdge(
        'system:edgetype:default-view',
        'system:nodetype:code-block',
        'system:view:code-block',
      ),
    ).toBeDefined();
    expect(
      findEdge('system:edgetype:default-view', 'system:nodetype:markdown', 'system:view:markdown'),
    ).toBeDefined();
  });

  it('migrates the 4 previously-hardcoded namespaces so they resolve as valid', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    expect(parseNamespace(graph, 'system').ok).toBe(true);
    expect(parseNamespace(graph, 'user').ok).toBe(true);
    expect(parseNamespace(graph, 'imported').ok).toBe(true);
    expect(parseNamespace(graph, 'user-settings').ok).toBe(true);
    expect(parseNamespace(graph, 'not-a-real-namespace').ok).toBe(false);
  });

  it('gives each migrated namespace the kind matching its restriction status', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    const kindOf = (id: NodeId): unknown => graph.nodes.get(id)?.properties.get('kind');

    // 'system' is the only migrated namespace RESTRICTED_NAMESPACE_KINDS blocks writes to --
    // its kind must match, and the other 3 must not collide with a restricted kind.
    expect(kindOf(SYSTEM_IDS.NAMESPACE_SYSTEM)).toBe('system');
    expect(RESTRICTED_NAMESPACE_KINDS.has(kindOf(SYSTEM_IDS.NAMESPACE_SYSTEM) as string)).toBe(
      true,
    );

    expect(kindOf(SYSTEM_IDS.NAMESPACE_USER)).toBe('user');
    expect(kindOf(SYSTEM_IDS.NAMESPACE_IMPORTED)).toBe('imported');
    expect(kindOf(SYSTEM_IDS.NAMESPACE_USER_SETTINGS)).toBe('user-settings');
    for (const id of [
      SYSTEM_IDS.NAMESPACE_USER,
      SYSTEM_IDS.NAMESPACE_IMPORTED,
      SYSTEM_IDS.NAMESPACE_USER_SETTINGS,
    ]) {
      expect(RESTRICTED_NAMESPACE_KINDS.has(kindOf(id) as string)).toBe(false);
    }
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
    expect(nodeTypes.find((n) => n.id === SYSTEM_IDS.NAMESPACE_DEF)).toBeDefined();
    expect(nodeTypes.find((n) => n.id === SYSTEM_IDS.PROPERTY_TYPE_DEF)).toBeDefined();
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
