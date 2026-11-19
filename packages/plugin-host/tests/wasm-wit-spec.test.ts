import { describe, expect, it } from 'bun:test';
import { CANOPY_WIT_SPECIFICATION } from '../src/wasm/wit-spec';

describe('WASM WIT Specification', () => {
  it('defines unified package name', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('package canopy:graph;');
  });

  it('defines graph-types interface with error codes and records', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface graph-types');
    expect(CANOPY_WIT_SPECIFICATION).toContain('enum error-code');
    expect(CANOPY_WIT_SPECIFICATION).toContain('record adapter-error');
  });

  it('defines host-queries interface', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-queries');
    expect(CANOPY_WIT_SPECIFICATION).toContain('query-nodes: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('query-edges: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('lookup-properties: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('traverse-graph: func');
  });

  it('defines host-mutations interface', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-mutations');
    expect(CANOPY_WIT_SPECIFICATION).toContain('create-node: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('update-node-properties: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('delete-node: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('create-edge: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('delete-edge: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('commit-batch: func');
  });

  it('defines host-events and non-hermetic host interfaces', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-events');
    expect(CANOPY_WIT_SPECIFICATION).toContain('subscribe-events: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('replay-events: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-filesystem');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-http');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-secrets');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-clock');
  });

  it('defines guest interfaces', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface draft-session');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface plugin-manifest');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface plugin-lifecycle');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface content-rendering');
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface wizard-execution');
  });

  it('defines graph-plugin, server-extension-plugin, wizard-plugin, and render-plugin worlds', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('world graph-plugin');
    expect(CANOPY_WIT_SPECIFICATION).toContain('import host-queries;');
    expect(CANOPY_WIT_SPECIFICATION).toContain('import host-mutations;');
    expect(CANOPY_WIT_SPECIFICATION).toContain('import host-events;');
    expect(CANOPY_WIT_SPECIFICATION).toContain('export execute: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('world server-extension-plugin');
    expect(CANOPY_WIT_SPECIFICATION).toContain('world wizard-plugin');
    expect(CANOPY_WIT_SPECIFICATION).toContain('world render-plugin');
  });
});
