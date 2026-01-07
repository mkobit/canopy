import { describe, it, expect } from 'vitest';
import { createGraph, bootstrap, SYSTEM_IDS, addNode } from '@canopy/core';
import { saveViewDefinition, getViewDefinition, resolveView, listViewDefinitions } from '../src/views';
import { saveQueryDefinition } from '../src/stored';
import { Query } from '../src/model';

describe('View Definitions', () => {
  it('should save and retrieve a view definition', () => {
    let graph = createGraph();
    graph = bootstrap(graph);

    // Create a query first
    const query: Query = { steps: [{ kind: 'node-scan' }] };
    const { graph: g1, nodeId: queryId } = saveQueryDefinition(graph, 'My Query', query);
    graph = g1;

    // Save view
    const { graph: g2, nodeId: viewId } = saveViewDefinition(graph, {
      name: 'My View',
      description: 'A test view',
      queryRef: queryId,
      layout: 'table',
      sortBy: 'name',
      sortDirection: 'asc',
      pageSize: 20
    });
    graph = g2;

    // Retrieve view
    const view = getViewDefinition(graph, viewId);
    expect(view.name).toBe('My View');
    expect(view.description).toBe('A test view');
    expect(view.queryRef).toBe(queryId);
    expect(view.layout).toBe('table');
    expect(view.sortBy).toBe('name');
    expect(view.sortDirection).toBe('asc');
    expect(view.pageSize).toBe(20);
  });

  it('should resolve a view to its query', () => {
    let graph = createGraph();
    graph = bootstrap(graph);

    const query: Query = { steps: [{ kind: 'node-scan' }] };
    const { graph: g1, nodeId: queryId } = saveQueryDefinition(graph, 'My Query', query);
    graph = g1;

    const { graph: g2, nodeId: viewId } = saveViewDefinition(graph, {
      name: 'Resolved View',
      queryRef: queryId,
      layout: 'list'
    });
    graph = g2;

    const resolved = resolveView(graph, viewId);
    expect(resolved.definition.name).toBe('Resolved View');
    expect(resolved.query).toEqual(query);
  });

  it('should list all view definitions', () => {
    let graph = createGraph();
    graph = bootstrap(graph);

    // Check default system views
    const views = listViewDefinitions(graph);
    expect(views.length).toBeGreaterThanOrEqual(3);

    const names = views.map(v => v.properties.get('name')?.kind === 'text' ? v.properties.get('name')?.value : '');
    expect(names).toContain('All Nodes');
    expect(names).toContain('By Type');
    expect(names).toContain('Recent');
  });

  it('should have correct default views setup via bootstrap', () => {
    let graph = createGraph();
    graph = bootstrap(graph);

    const allNodesView = getViewDefinition(graph, SYSTEM_IDS.VIEW_ALL_NODES);
    expect(allNodesView.name).toBe('All Nodes');
    expect(allNodesView.layout).toBe('table');
    expect(allNodesView.queryRef).toBe(SYSTEM_IDS.QUERY_ALL_NODES);

    const resolved = resolveView(graph, SYSTEM_IDS.VIEW_ALL_NODES);
    expect(resolved.query).toEqual({ steps: [{ kind: 'node-scan' }] });
  });
});
