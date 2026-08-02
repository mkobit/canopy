import { describe, expect, test } from 'bun:test';
import { generateGraphVault, generateVault } from '../graph-generators';
import { generateNodePayload } from '../node-generators';
import { generateSchemaPayload } from '../schema-generators';
import { generateQueryPayload } from '../query-generators';
import { SYSTEM_EDGE_TYPES } from '@canopy/graph';

describe('Property-Based Vault Generators', () => {
  test('generates deterministic vault when seed is specified', () => {
    const vault1 = generateGraphVault({ preset: 'demo', seed: 42 });
    const vault2 = generateGraphVault({ preset: 'demo', seed: 42 });

    expect(vault1.nodes.size).toBeGreaterThan(0);
    expect(vault1.nodes.size).toEqual(vault2.nodes.size);

    const ids1 = [...vault1.nodes.keys()].toSorted((a, b) => a.localeCompare(b));
    const ids2 = [...vault2.nodes.keys()].toSorted((a, b) => a.localeCompare(b));
    expect(ids1).toEqual(ids2);
  });

  test('generates graph session vault backed by seeded event store', async () => {
    const session = generateVault({ preset: 'demo', seed: 42 });
    await session.load();
    expect(session.graph().nodes.size).toBeGreaterThan(0);
    expect(session.graph().edges.size).toBeGreaterThan(0);
  });

  test('generates thin, convention-driven initial schemas', () => {
    const vault = generateGraphVault({ preset: 'demo', seed: 42 });
    expect(vault.nodes.size).toBeGreaterThan(5);

    const schema = generateSchemaPayload({ seed: 42 });
    expect(schema.nodeTypes.length).toBeGreaterThan(0);
    expect(schema.edgeTypes.length).toBeGreaterThan(0);

    const nodeTypeNames = schema.nodeTypes.map((nodeType) => nodeType.name);
    expect(nodeTypeNames).toContain('Project');
    expect(nodeTypeNames).toContain('Task');
    expect(nodeTypeNames).toContain('Note');
  });

  test('generates node payload with proper properties', () => {
    const payload = generateNodePayload(0, 42);
    expect(payload.id).toBeDefined();
    expect(payload.type).toBeDefined();
    expect(payload.properties).toBeDefined();
    expect(payload.properties.title).toBeDefined();
  });

  test('generates query payload with valid DSL definition', () => {
    const query = generateQueryPayload(0, 42);
    expect(query.id).toBeDefined();
    expect(query.name).toBeDefined();
    expect(query.definition).toBeDefined();
  });

  test('decouples rendering from content storage (Invariant 10)', () => {
    const vault = generateGraphVault({ preset: 'demo', seed: 42 });
    expect(vault.edges.size).toBeGreaterThan(0);

    const defaultViewEdges = [...vault.edges.values()].filter(
      (edge) => edge.type === SYSTEM_EDGE_TYPES.DEFAULT_VIEW,
    );
    expect(defaultViewEdges.length).toBeGreaterThan(0);

    const usesRendererEdges = [...vault.edges.values()].filter(
      (edge) => edge.type === SYSTEM_EDGE_TYPES.USES_RENDERER,
    );
    expect(usesRendererEdges.length).toBeGreaterThan(0);
  });

  test('generates large preset vault for performance stress testing', () => {
    const vault = generateGraphVault({ preset: 'large', seed: 100 });
    expect(vault.nodes.size).toBeGreaterThan(500);
  });
});
