import { describe, expect, it } from 'bun:test';
import { CANOPY_WIT_SPECIFICATION } from '../src/wasm/wit-spec';

describe('WASM WIT Specification', () => {
  it('defines package name and version', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('package canopy:graph-api@0.1.0;');
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
  });

  it('defines host-events interface', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('interface host-events');
    expect(CANOPY_WIT_SPECIFICATION).toContain('subscribe-events: func');
    expect(CANOPY_WIT_SPECIFICATION).toContain('replay-events: func');
  });

  it('defines graph-plugin world importing host interfaces and exporting execute', () => {
    expect(CANOPY_WIT_SPECIFICATION).toContain('world graph-plugin');
    expect(CANOPY_WIT_SPECIFICATION).toContain('import host-queries;');
    expect(CANOPY_WIT_SPECIFICATION).toContain('import host-mutations;');
    expect(CANOPY_WIT_SPECIFICATION).toContain('import host-events;');
    expect(CANOPY_WIT_SPECIFICATION).toContain('export execute: func');
  });
});
