import { asNodeId, type NodeId } from '@canopy/graph';

export type GeneratedQueryPayload = Readonly<{
  id: NodeId;
  name: string;
  description: string;
  definition: unknown;
}>;

export type GenerateQueryOptions = Readonly<{
  index: number;
  seed?: number | undefined;
}>;

const DEFAULT_QUERY: Readonly<{
  id: string;
  name: string;
  description: string;
  definition: unknown;
}> = {
  id: 'demo:query:all-projects',
  name: 'All Projects',
  description: 'Queries all user project nodes.',
  definition: {
    steps: [
      { kind: 'node-scan' },
      { kind: 'filter-by-type', targetType: 'user:node-type:project' },
    ],
  },
};

const QUERIES: readonly Readonly<{
  id: string;
  name: string;
  description: string;
  definition: unknown;
}>[] = [
  DEFAULT_QUERY,
  {
    id: 'demo:query:active-tasks',
    name: 'Active Tasks',
    description: 'Queries tasks that are not done.',
    definition: {
      steps: [
        { kind: 'node-scan' },
        { kind: 'filter-by-type', targetType: 'user:node-type:task' },
        { kind: 'filter-property', property: 'status', operator: 'neq', value: 'done' },
      ],
    },
  },
  {
    id: 'demo:query:recent-notes',
    name: 'Recent Notes',
    description: 'Queries recent research notes sorted by modification date.',
    definition: {
      steps: [
        { kind: 'node-scan' },
        { kind: 'filter-by-type', targetType: 'user:node-type:note' },
        { kind: 'sort', sort: { property: 'metadata.modified', direction: 'desc' } },
      ],
    },
  },
  {
    id: 'demo:query:high-priority',
    name: 'High Priority Items',
    description: 'Queries high priority tasks across all projects.',
    definition: {
      steps: [
        { kind: 'node-scan' },
        { kind: 'filter-property', property: 'priority', operator: 'eq', value: 'high' },
      ],
    },
  },
];

export function generateQueryPayload(
  indexOrOptions: number | GenerateQueryOptions,
  seed?: number,
): GeneratedQueryPayload {
  const index = typeof indexOrOptions === 'number' ? indexOrOptions : indexOrOptions.index;
  const effectiveSeed = typeof indexOrOptions === 'number' ? seed : indexOrOptions.seed;

  const queryIndex = (index + (effectiveSeed ?? 0)) % QUERIES.length;
  const template = QUERIES[queryIndex] ?? DEFAULT_QUERY;

  return {
    id: asNodeId(`${template.id}-${index}`),
    name: `${template.name} ${index}`,
    description: template.description,
    definition: template.definition,
  };
}
