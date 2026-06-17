import type { Graph } from './graph';
import type { GraphId } from './identifiers';
import type { Result } from './result';
import { createInstant } from './factories';
import { bootstrap, SYSTEM_DEVICE_ID } from './bootstrap';

export function createGraph(id: GraphId, name: string): Result<Graph, Error> {
  const graph: Graph = {
    id,
    name,
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    },
    nodes: new Map(),
    edges: new Map(),
  };
  return bootstrap(graph);
}
