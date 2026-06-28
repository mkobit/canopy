import { describe, it, expect } from 'bun:test';
import { SYSTEM_IDS, asGraphId, createGraph, unwrap } from '@canopy/graph';
import { listAllowedNodeTypes } from '../node-types';

function bootstrappedGraph() {
  return unwrap(createGraph(asGraphId('test-node-types'), 'Test'));
}

describe('listAllowedNodeTypes', () => {
  it('returns Markdown and CodeBlock from a bootstrapped graph', () => {
    const graph = bootstrappedGraph();
    const types = listAllowedNodeTypes(graph);
    const ids = types.map((t) => t.id);
    expect(ids).toContain(SYSTEM_IDS.TYPE_MARKDOWN);
    expect(ids).toContain(SYSTEM_IDS.TYPE_CODE_BLOCK);
  });

  it('excludes TextBlock (list-property limitation) and meta-types', () => {
    const graph = bootstrappedGraph();
    const ids = listAllowedNodeTypes(graph).map((t) => t.id);
    expect(ids).not.toContain(SYSTEM_IDS.TYPE_TEXT_BLOCK);
    expect(ids).not.toContain(SYSTEM_IDS.NODE_TYPE);
    expect(ids).not.toContain(SYSTEM_IDS.EDGE_TYPE);
    expect(ids).not.toContain(SYSTEM_IDS.QUERY_DEFINITION);
    expect(ids).not.toContain(SYSTEM_IDS.VIEW_DEFINITION);
    expect(ids).not.toContain(SYSTEM_IDS.TEMPLATE);
    expect(ids).not.toContain(SYSTEM_IDS.RENDERER);
    expect(ids).not.toContain(SYSTEM_IDS.SETTINGS_SCHEMA);
    expect(ids).not.toContain(SYSTEM_IDS.USER_SETTING);
  });

  it('parses each type’s PropertyDefinition[] from its JSON-string properties field', () => {
    const types = listAllowedNodeTypes(bootstrappedGraph());
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
    const types = listAllowedNodeTypes(bootstrappedGraph());
    const markdown = types.find((t) => t.id === SYSTEM_IDS.TYPE_MARKDOWN);
    expect(markdown?.label).toBe('MarkdownNode');
    expect(markdown?.description).toBe('A node containing markdown content.');
  });
});
