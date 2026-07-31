# Design: Graph rendering scalability & viewport culling (`canopy-gtv.2.3`)

## Context

Bead `canopy-gtv.2.3`.
Following graph spatial navigation (`canopy-gtv.2.1`) and WCAG accessibility announcements (`canopy-gtv.2.2`), the graph canvas must maintain smooth 60 FPS rendering, zooming, and panning when displaying large graphs (500+ to 5,000+ nodes).

To keep current implementation focused while planning comprehensive long-term testing, system-wide backend/service load testing has been tracked under epic `canopy-pm0` (`canopy-pm0.1`–`canopy-pm0.3`). This design focuses on UI graph canvas scalability, ReactFlow culling, memoized layout lookup maps, and co-located UI load testing.

## Goals & non-goals

### Goals

- Enable viewport culling on `GraphCanvas` (`XYFlow`) via `onlyRenderVisibleElements={true}` so off-screen DOM nodes/edges are unmounted during pan/zoom.
- Optimize node/edge lookup maps and selection states in `InteractiveGraphView` to $O(1)$ `Map` operations, eliminating $O(N)$ array searches on render cycles.
- Enforce strict `React.memo` equality checks on `CustomNode` and `CustomEdge` components so unselected nodes skip React re-renders.
- Create co-located UI load test [`apps/web/src/components/graph/__tests__/graph-rendering.load.test.ts`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/__tests__/graph-rendering.load.test.ts) measuring graph projection conversion and selection query latency under 500+ and 5,000 node payloads.
- Provide interactive Storybook stress-testing controls in [`graph-canvas.stories.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/graph-canvas.stories.tsx) with magnitude parameters (100, 500, 1,000, 5,000 nodes).

### Non-goals

- Backend SQLite / IndexedDB event log replay benchmarks (tracked in `canopy-pm0.2`).
- CLI IPC socket streaming load tests (tracked in `canopy-pm0.3`).

## Decisions

### Decision 1: ReactFlow Viewport Culling & Buffer Margin

Configure `GraphCanvas` (`XYFlow`) with `onlyRenderVisibleElements={true}`. Visible node bounds are calculated automatically by XYFlow using the canvas viewport transform. An off-screen buffer margin ensures seamless panning without visual clipping artifacts.

### Decision 2: $O(1)$ Memoized Node & Edge Indices

In `InteractiveGraphView`, replace array scans for node and edge lookups with memoized maps:
- `nodeMap`: `Map<NodeId, Node>` for instant $O(1)$ spatial coordinate and property lookups.
- `edgeMap`: `Map<NodeId, Set<EdgeId>>` for $O(1)$ adjacency resolution during selection highlights.

### Decision 3: Co-located UI Load Test Convention (`.load.test.ts`)

Instead of creating a separate load test directory structure, performance and load tests use the `.load.test.ts` extension within the component's `__tests__/` directory (`graph-rendering.load.test.ts`). This aligns with existing project conventions (such as `incremental-projection.property.test.ts`) and enables direct execution via `bun test graph-rendering.load.test.ts`.

## Technical implementation details

### Benchmark Fixture & Load Test API

```ts
export interface GraphBenchmarkFixtureOptions {
  readonly nodeCount: number;
  readonly edgeDensity?: number;
  readonly clusterCount?: number;
}

export interface GraphBenchmarkFixture {
  readonly nodes: readonly CustomNodeData[];
  readonly edges: readonly CustomEdgeData[];
}

export function generateGraphBenchmarkFixture(
  options: GraphBenchmarkFixtureOptions
): GraphBenchmarkFixture;
```

## Adversarial review and mitigations

### 1. Resource and performance overhead

- **Risk**: Enabling viewport culling (`onlyRenderVisibleElements`) requires XYFlow to re-evaluate visible nodes on every pan/zoom event, which could cause micro-jank if spatial math is un-memoized.
- **Mitigation**: XYFlow performs quadtree spatial lookups internally. Memoizing `nodes` and `edges` props with stable references prevents recalculating graph layout positions during viewport panning.

### 2. Failure modes and edge cases

- **Risk 1**: Fast zooming out to view a 5,000-node graph simultaneously renders all nodes into the DOM, breaking the 16.6ms frame budget.
- **Mitigation**: When zoom level drops below a low-visibility threshold (e.g. `zoom < 0.3`), nodes render in simplified low-detail badge cards without complex property sub-trees.
- **Risk 2**: Large edge counts (10,000+ edges) degrade SVG layer performance even when nodes are culled.
- **Mitigation**: Edges connected to culled off-screen nodes are culled simultaneously by XYFlow when `onlyRenderVisibleElements` is active.

### 3. Security and isolation

- **Risk**: Generating 5,000+ synthetic node benchmark fixtures could trigger memory leaks or out-of-memory errors in CI unit test runs.
- **Mitigation**: Load test fixtures use deterministic seed-based generators without retaining global window references, allowing GC cleanup after each test suite iteration.

### 4. Migration and backward compatibility risks

- **Risk**: Refactoring `InteractiveGraphView` props or lookup methods breaks existing spatial navigation hooks or WCAG live region announcers.
- **Mitigation**: Existing selection and navigation hooks consume stable `GraphSession` state contracts; internal optimizations use React `useMemo` hooks without changing external component signatures.
