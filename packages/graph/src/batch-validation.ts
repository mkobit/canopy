import type { Graph } from './graph';
import type { GraphEvent } from './events';
import type { BatchId, CommitSeq, EdgeId, NodeId } from './identifiers';
import type { HlcTimestamp } from './hlc';
import type { Result } from './result';
import { err as error, ok } from './result';
import { projectGraph } from './projection';
import { isSystemNodeId } from './system';
import { validateEdge, validateNode } from './validation';
import type { ValidationError, ValidationResult } from './validation-types';

export type CommitError =
  | Readonly<{
      kind: 'validation';
      message: string;
      batchId: BatchId;
      errors: readonly ValidationError[];
    }>
  | Readonly<{ kind: 'projection'; message: string; batchId: BatchId }>
  | Readonly<{ kind: 'batch'; message: string }>
  | Readonly<{ kind: 'system-node'; message: string; nodeId: NodeId }>
  | Readonly<{
      kind: 'concurrency-conflict';
      message: string;
      entityId?: NodeId | EdgeId | undefined;
      expectedSeq?: CommitSeq | undefined;
      actualSeq?: CommitSeq | undefined;
    }>
  | Readonly<{ kind: 'storage'; message: string; cause: Error }>;

export interface CommitSuccess {
  readonly graph: Graph;
  readonly batchId: BatchId;
  readonly commitSeq: CommitSeq;
  readonly hlcTimestamp: HlcTimestamp;
  readonly events: readonly GraphEvent[];
  readonly warnings: readonly ValidationError[];
}

function collectTouchedIds(events: readonly GraphEvent[]): Readonly<{
  nodeIds: readonly NodeId[];
  edgeIds: readonly EdgeId[];
}> {
  const nodeIds = new Set(
    events
      .filter((event) => event.type === 'NodeCreated' || event.type === 'NodePropertiesUpdated')
      .map((event) => event.id),
  );
  const edgeIds = new Set(
    events
      .filter((event) => event.type === 'EdgeCreated' || event.type === 'EdgePropertiesUpdated')
      .map((event) => event.id),
  );

  return { nodeIds: [...nodeIds], edgeIds: [...edgeIds] };
}

/**
Validates a candidate batch against a pre-commit graph without mutating state.
Runs system-node deletion checks, dry-run projection (with `_indexes` stripped),
and shape validation across all touched nodes and edges, collecting every error
and warning.
*/
export function validateBatch(
  graph: Graph,
  events: readonly GraphEvent[],
  batchId: BatchId,
): Result<readonly ValidationError[], CommitError> {
  const deletedSystemEvent = events.find(
    (event) => event.type === 'NodeDeleted' && isSystemNodeId(event.id),
  );
  if (deletedSystemEvent && deletedSystemEvent.type === 'NodeDeleted') {
    return error({
      kind: 'system-node',
      message: `Cannot delete system node: ${deletedSystemEvent.id}`,
      nodeId: deletedSystemEvent.id,
    });
  }

  const dryRun = projectGraph(events, { ...graph, _indexes: undefined });
  if (!dryRun.ok) {
    return error({
      kind: 'projection',
      message: dryRun.error.message,
      batchId,
    });
  }
  const dryRunGraph = dryRun.value;

  const { nodeIds, edgeIds } = collectTouchedIds(events);
  const nodeResults: readonly ValidationResult[] = nodeIds.flatMap((id) => {
    const node = dryRunGraph.nodes.get(id);
    if (!node) return [];
    const previousNode = graph.nodes.get(id);
    const mode = previousNode === undefined ? 'create' : 'update';
    return [validateNode(dryRunGraph, node, mode, previousNode)];
  });
  const edgeResults: readonly ValidationResult[] = edgeIds.flatMap((id) => {
    const edge = dryRunGraph.edges.get(id);
    if (!edge) return [];
    const mode = graph.edges.has(id) ? 'update' : 'create';
    return [validateEdge(dryRunGraph, edge, mode)];
  });

  const allResults = [...nodeResults, ...edgeResults];
  const allErrors = allResults.flatMap((result) => result.errors);
  const allWarnings = allResults.flatMap((result) => result.warnings);

  if (allErrors.length > 0) {
    const detail = allErrors.map((issue) => issue.message).join('; ');
    return error({
      kind: 'validation',
      message: `Batch validation failed (${allErrors.length} error(s)): ${detail}`,
      batchId,
      errors: allErrors,
    });
  }

  return ok(allWarnings);
}
