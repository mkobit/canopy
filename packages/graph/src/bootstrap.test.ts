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
    const nodeTypeDefinition = graph.nodes.get(SYSTEM_IDS.NODE_TYPE_DEF);
    expect(nodeTypeDefinition).toBeDefined();
    expect(nodeTypeDefinition?.type).toBe(SYSTEM_IDS.NODE_TYPE);
    expect(nodeTypeDefinition?.properties.get('name')).toEqual('Node Type');
    expect(nodeTypeDefinition?.properties.get('namespace')).toEqual('system');

    // Check EdgeType definition
    const edgeTypeDefinition = graph.nodes.get(SYSTEM_IDS.EDGE_TYPE_DEF);
    expect(edgeTypeDefinition).toBeDefined();
    expect(edgeTypeDefinition?.type).toBe(SYSTEM_IDS.NODE_TYPE); // EdgeType definition is a NodeType
    expect(edgeTypeDefinition?.properties.get('name')).toEqual('Edge Type');
    expect(edgeTypeDefinition?.properties.get('namespace')).toEqual('system');

    // Check Renderer definition
    const rendererDefinition = graph.nodes.get(SYSTEM_IDS.RENDERER_DEF);
    expect(rendererDefinition).toBeDefined();
    expect(rendererDefinition?.type).toBe(SYSTEM_IDS.NODE_TYPE);
    expect(rendererDefinition?.properties.get('name')).toEqual('Renderer');
    expect(rendererDefinition?.properties.get('namespace')).toEqual('system');

    // Check Namespace definition (self-describing metatype for the Namespace node shape)
    const namespaceDefinition = graph.nodes.get(SYSTEM_IDS.NAMESPACE_DEF);
    expect(namespaceDefinition).toBeDefined();
    expect(namespaceDefinition?.type).toBe(SYSTEM_IDS.NODE_TYPE);
    expect(namespaceDefinition?.properties.get('name')).toEqual('Namespace');
    expect(namespaceDefinition?.properties.get('namespace')).toEqual('system');
    expect(
      JSON.parse(namespaceDefinition?.properties.get('properties') as string).map(
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
    const propertyTypeDefinition = graph.nodes.get(SYSTEM_IDS.PROPERTY_TYPE_DEF);
    expect(propertyTypeDefinition).toBeDefined();
    expect(propertyTypeDefinition?.type).toBe(SYSTEM_IDS.NODE_TYPE);
    expect(propertyTypeDefinition?.properties.get('name')).toEqual('Property Type');
    expect(propertyTypeDefinition?.properties.get('namespace')).toEqual('system');
    expect(
      JSON.parse(propertyTypeDefinition?.properties.get('properties') as string).map(
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
    const settingsSchemaDefinition = graph.nodes.get(SYSTEM_IDS.SETTINGS_SCHEMA_DEF);
    expect(settingsSchemaDefinition).toBeDefined();
    expect(settingsSchemaDefinition?.type).toBe(SYSTEM_IDS.NODE_TYPE);

    const userSettingDefinition = graph.nodes.get(SYSTEM_IDS.USER_SETTING_DEF);
    expect(userSettingDefinition).toBeDefined();
    expect(userSettingDefinition?.type).toBe(SYSTEM_IDS.NODE_TYPE);

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
    const usesRendererDefinition = graph.nodes.get(SYSTEM_IDS.EDGE_USES_RENDERER);
    expect(usesRendererDefinition).toBeDefined();
    expect(usesRendererDefinition?.type).toBe(SYSTEM_IDS.EDGE_TYPE);
    expect(usesRendererDefinition?.properties.get('name')).toBe('uses_renderer');

    const viewOverrideDefinition = graph.nodes.get(SYSTEM_IDS.EDGE_VIEW_OVERRIDE);
    expect(viewOverrideDefinition).toBeDefined();
    expect(viewOverrideDefinition?.type).toBe(SYSTEM_IDS.EDGE_TYPE);
    expect(viewOverrideDefinition?.properties.get('name')).toBe('view_override');

    const defaultViewEdgeDefinition = graph.nodes.get(SYSTEM_IDS.EDGE_DEFAULT_VIEW);
    expect(defaultViewEdgeDefinition).toBeDefined();
    expect(defaultViewEdgeDefinition?.type).toBe(SYSTEM_IDS.EDGE_TYPE);
    expect(defaultViewEdgeDefinition?.properties.get('name')).toBe('default_view');

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
      return graph.edges
        .values()
        .find((edge) => edge.type === type && edge.source === source && edge.target === target);
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
