import { describe, expect, test } from 'bun:test';
import {
  checkCycle,
  checkDocumentParity,
  checkLeaf,
  deriveAllEdges,
  deriveRuntimeEdges,
  extractMermaidBlock,
  parseMermaidGraph,
  resolveMermaidGraph,
} from './check-dependency-graph.js';

// Pins the mermaid parser and all three assertions against a small synthetic
// graph so a regex/scope change or an assertion bug is caught rather than
// silently shifting what the guard reports on the real repo.

const CLEAN_WORKSPACES = [
  { name: '@canopy/graph', workspaceDir: 'packages/graph', runtimeDeps: [], devDeps: [] },
  {
    name: '@canopy/queries',
    workspaceDir: 'packages/queries',
    runtimeDeps: ['@canopy/graph'],
    devDeps: [],
  },
  {
    name: '@canopy/web',
    workspaceDir: 'apps/web',
    runtimeDeps: ['@canopy/graph', '@canopy/queries'],
    devDeps: [],
  },
];

const CLEAN_MERMAID = [
  '## Dependency graph',
  '',
  '```mermaid',
  'graph TD',
  '  graph[@canopy/graph]',
  '  queries[@canopy/queries]',
  '  web[apps/web]',
  '',
  '  queries --> graph',
  '  web --> graph',
  '  web --> queries',
  '```',
  '',
  'Trailing prose after the block.',
].join('\n');

function parseClean() {
  const lines = extractMermaidBlock(CLEAN_MERMAID);
  if (lines === undefined) throw new Error('fixture setup: mermaid block not found');
  const graph = parseMermaidGraph(lines);
  if (graph === undefined) throw new Error('fixture setup: mermaid graph did not parse');
  return graph;
}

describe('extractMermaidBlock', () => {
  test('extracts the fenced block under the Dependency graph heading', () => {
    const lines = extractMermaidBlock(CLEAN_MERMAID);
    expect(lines).toBeDefined();
    expect(lines?.some((line) => line.includes('web --> queries'))).toBe(true);
    expect(lines?.some((line) => line.includes('Trailing prose'))).toBe(false);
  });

  test('returns undefined when the heading is missing', () => {
    expect(extractMermaidBlock('# Some other doc\n\nNo heading here.\n')).toBeUndefined();
  });
});

describe('parseMermaidGraph', () => {
  test('parses node declarations and edges', () => {
    const graph = parseClean();
    expect(graph.nodes.get('web')).toBe('apps/web');
    expect(graph.edges).toContainEqual({ from: 'web', to: 'queries' });
  });

  test('fails loudly (returns undefined) on an unrecognized construct', () => {
    const lines = ['graph TD', '  graph[@canopy/graph]', '  graph -->|labeled| queries'];
    expect(parseMermaidGraph(lines)).toBeUndefined();
  });
});

describe('resolveMermaidGraph', () => {
  test('resolves both name-style and path-style labels to the same workspace namespace', () => {
    const graph = parseClean();
    const resolved = resolveMermaidGraph(graph, CLEAN_WORKSPACES);
    expect(resolved.unresolvedLabels).toEqual([]);
    expect(resolved.documentedNodeNames.toSorted((a, b) => a.localeCompare(b))).toEqual(
      ['@canopy/graph', '@canopy/queries', '@canopy/web'].toSorted((a, b) => a.localeCompare(b)),
    );
    expect(resolved.documentedEdges).toContainEqual({ from: '@canopy/web', to: '@canopy/queries' });
  });

  test('reports a label that resolves to no workspace', () => {
    const lines = extractMermaidBlock(
      ['## Dependency graph', '', '```mermaid', 'graph TD', '  ghost[@canopy/ghost]', '```'].join(
        '\n',
      ),
    );
    const graph = parseMermaidGraph(lines ?? []);
    const resolved = resolveMermaidGraph(
      graph ?? { nodes: new Map(), edges: [] },
      CLEAN_WORKSPACES,
    );
    expect(resolved.unresolvedLabels).toEqual(['@canopy/ghost']);
  });
});

describe('checkLeaf', () => {
  test('passes when the kernel has no internal dependencies', () => {
    expect(checkLeaf(CLEAN_WORKSPACES)).toEqual([]);
  });

  test('fails on a runtime dependency from the kernel', () => {
    const workspaces = [
      { ...CLEAN_WORKSPACES[0], runtimeDeps: ['@canopy/queries'] },
      ...CLEAN_WORKSPACES.slice(1),
    ];
    const violations = checkLeaf(workspaces);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('runtime dependency');
  });

  test('fails on a dev-only dependency from the kernel', () => {
    const workspaces = [
      { ...CLEAN_WORKSPACES[0], devDeps: ['@canopy/storage-sqlite'] },
      ...CLEAN_WORKSPACES.slice(1),
    ];
    const violations = checkLeaf(workspaces);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('devDependency');
  });
});

describe('checkCycle', () => {
  test('passes on an acyclic graph', () => {
    const edges = deriveAllEdges(CLEAN_WORKSPACES);
    const names = CLEAN_WORKSPACES.map((workspace) => workspace.name);
    expect(checkCycle(names, edges)).toEqual([]);
  });

  test('a dev-only dependency that closes a cycle is caught', () => {
    // Generic two-package cycle formed purely by a devDependency edge.
    const workspaces = [
      { name: '@canopy/a', workspaceDir: 'packages/a', runtimeDeps: [], devDeps: ['@canopy/b'] },
      { name: '@canopy/b', workspaceDir: 'packages/b', runtimeDeps: ['@canopy/a'], devDeps: [] },
    ];
    const edges = deriveAllEdges(workspaces);
    const names = workspaces.map((workspace) => workspace.name);
    const violations = checkCycle(names, edges);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('@canopy/a');
    expect(violations[0]?.message).toContain('@canopy/b');
  });

  test('reproduces the F2 shape: a kernel test dependency closing a cycle back into itself', () => {
    // graph -[dev]-> storage-sqlite -[runtime]-> graph
    const workspaces = [
      {
        name: '@canopy/graph',
        workspaceDir: 'packages/graph',
        runtimeDeps: [],
        devDeps: ['@canopy/storage-sqlite'],
      },
      {
        name: '@canopy/storage-sqlite',
        workspaceDir: 'packages/storage-sqlite',
        runtimeDeps: ['@canopy/graph'],
        devDeps: [],
      },
    ];
    const edges = deriveAllEdges(workspaces);
    const names = workspaces.map((workspace) => workspace.name);
    expect(checkCycle(names, edges)).toHaveLength(1);
  });
});

describe('checkDocumentParity', () => {
  test('passes when documented edges equal runtime edges and every workspace has a node', () => {
    const graph = parseClean();
    const resolved = resolveMermaidGraph(graph, CLEAN_WORKSPACES);
    const runtimeEdges = deriveRuntimeEdges(CLEAN_WORKSPACES);
    expect(checkDocumentParity(CLEAN_WORKSPACES, runtimeEdges, resolved)).toEqual([]);
  });

  test('fails on an undocumented runtime edge', () => {
    // graph -> queries is a new real edge the (unchanged) diagram never documented.
    const workspaces = [
      { ...CLEAN_WORKSPACES[0], runtimeDeps: ['@canopy/queries'] },
      ...CLEAN_WORKSPACES.slice(1),
    ];
    const graph = parseClean();
    const resolved = resolveMermaidGraph(graph, workspaces);
    const runtimeEdges = deriveRuntimeEdges(workspaces);
    const violations = checkDocumentParity(workspaces, runtimeEdges, resolved);
    expect(violations.some((violation) => violation.message.includes('not documented'))).toBe(true);
  });

  test('fails on a stale documented edge with no matching runtime dependency', () => {
    const graph = parseClean();
    const resolved = resolveMermaidGraph(graph, CLEAN_WORKSPACES);
    // Real runtime edges no longer include web -> queries, but the diagram still documents it.
    const runtimeEdges = deriveRuntimeEdges(CLEAN_WORKSPACES).filter(
      (edge) => !(edge.from === '@canopy/web' && edge.to === '@canopy/queries'),
    );
    const violations = checkDocumentParity(CLEAN_WORKSPACES, runtimeEdges, resolved);
    expect(
      violations.some((violation) => violation.message.includes('no matching runtime dependency')),
    ).toBe(true);
  });

  test('fails when a workspace has no node in the diagram', () => {
    const graph = parseClean();
    const resolved = resolveMermaidGraph(graph, CLEAN_WORKSPACES);
    const workspaces = [
      ...CLEAN_WORKSPACES,
      { name: '@canopy/settings', workspaceDir: 'packages/settings', runtimeDeps: [], devDeps: [] },
    ];
    const runtimeEdges = deriveRuntimeEdges(workspaces);
    const violations = checkDocumentParity(workspaces, runtimeEdges, resolved);
    expect(
      violations.some(
        (violation) =>
          violation.message.includes('@canopy/settings') && violation.message.includes('no node'),
      ),
    ).toBe(true);
  });
});
