import { describe, it, expect } from 'bun:test';
import { generateQueryBenchmarkFixture } from './query-benchmark-fixture';

describe('generateQueryBenchmarkFixture', () => {
  it('generates the specified number of nodes and connected edges', () => {
    const fixture = generateQueryBenchmarkFixture({
      nodeCount: 100,
      edgeDensity: 2,
      propertyCount: 4,
    });

    expect(fixture.graph.nodes.size).toBe(100);
    expect(fixture.events.length).toBeGreaterThanOrEqual(100);
    expect(fixture.sampleNodeIds.length).toBeGreaterThan(0);
  });
});
