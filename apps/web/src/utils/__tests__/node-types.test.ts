import { describe, it, expect } from 'bun:test';
import {
  SYSTEM_IDS,
  asGraphId,
  asDeviceId,
  createGraph,
  createNamespace,
  createNodeType,
  unwrap,
} from '@canopy/graph';
import { listNamespaces } from '../schema';
import { listAllowedNodeTypes } from '../node-types';

const DEVICE_ID = asDeviceId('00000000-0000-0000-0000-000000000000');
const OPTIONS = { deviceId: DEVICE_ID };

function bootstrappedGraph() {
  return unwrap(createGraph(asGraphId('test-node-types'), 'Test'));
}

describe('listAllowedNodeTypes', () => {
  it('returns Markdown, CodeBlock, TextBlock, and QueryDefinition from a bootstrapped graph', () => {
    const graph = bootstrappedGraph();
    const types = listAllowedNodeTypes(graph, listNamespaces(graph));
    const ids = types.map((t) => t.id);
    expect(ids).toContain(SYSTEM_IDS.TYPE_MARKDOWN);
    expect(ids).toContain(SYSTEM_IDS.TYPE_CODE_BLOCK);
    expect(ids).toContain(SYSTEM_IDS.TYPE_TEXT_BLOCK);
    expect(ids).toContain(SYSTEM_IDS.QUERY_DEFINITION);
  });

  it('excludes meta-types', () => {
    const graph = bootstrappedGraph();
    const ids = listAllowedNodeTypes(graph, listNamespaces(graph)).map((t) => t.id);
    expect(ids).not.toContain(SYSTEM_IDS.NODE_TYPE);
    expect(ids).not.toContain(SYSTEM_IDS.EDGE_TYPE);
    expect(ids).not.toContain(SYSTEM_IDS.VIEW_DEFINITION);
    expect(ids).not.toContain(SYSTEM_IDS.TEMPLATE);
    expect(ids).not.toContain(SYSTEM_IDS.RENDERER);
    expect(ids).not.toContain(SYSTEM_IDS.SETTINGS_SCHEMA);
    expect(ids).not.toContain(SYSTEM_IDS.USER_SETTING);
  });

  it('parses each type’s PropertyDefinition[] from its JSON-string properties field', () => {
    const graph = bootstrappedGraph();
    const types = listAllowedNodeTypes(graph, listNamespaces(graph));
    const markdown = types.find((t) => t.id === SYSTEM_IDS.TYPE_MARKDOWN);
    expect(markdown).toBeDefined();
    expect(markdown?.properties).toEqual([
      {
        name: 'content',
        valueKind: 'text',
        required: true,
        description: 'Markdown content',
      },
    ]);

    const codeBlock = types.find((t) => t.id === SYSTEM_IDS.TYPE_CODE_BLOCK);
    expect(codeBlock?.properties.map((p) => p.name)).toEqual(['content', 'language']);
    expect(codeBlock?.properties.find((p) => p.name === 'content')?.required).toBe(true);
    expect(codeBlock?.properties.find((p) => p.name === 'language')?.required).toBe(false);
  });

  it('exposes label and description from the type-def node properties', () => {
    const graph = bootstrappedGraph();
    const types = listAllowedNodeTypes(graph, listNamespaces(graph));
    const markdown = types.find((t) => t.id === SYSTEM_IDS.TYPE_MARKDOWN);
    expect(markdown?.label).toBe('MarkdownNode');
    expect(markdown?.description).toBe('A node containing markdown content.');
  });

  it('includes a dynamically-authored NodeType in a non-restricted namespace', () => {
    const afterNamespace = unwrap(
      createNamespace(bootstrappedGraph(), { name: 'content', kind: 'user' }, OPTIONS),
    ).value;
    const afterNodeType = unwrap(
      createNodeType(
        afterNamespace,
        {
          name: 'Task',
          namespace: 'content',
          properties: [{ kind: 'inline', name: 'title', valueKind: 'text', required: true }],
        },
        OPTIONS,
      ),
    ).value;

    const types = listAllowedNodeTypes(afterNodeType, listNamespaces(afterNodeType));
    expect(types.some((t) => t.label === 'Task')).toBe(true);
  });

  it('still excludes UserSetting even though its namespace (user-settings) is not restricted', () => {
    const graph = bootstrappedGraph();
    const ids = listAllowedNodeTypes(graph, listNamespaces(graph)).map((t) => t.id);
    expect(ids).not.toContain(SYSTEM_IDS.USER_SETTING);
  });
});
