import { asNodeId, asTypeId, type NodeId, type TypeId, type PropertyValue } from '@canopy/graph';

export type GeneratedNode = Readonly<{
  id: NodeId;
  type: TypeId;
  properties: Readonly<Record<string, PropertyValue>>;
}>;

const NODE_TYPES: readonly string[] = [
  'system:node-type:text-block',
  'system:node-type:markdown',
  'system:node-type:code-block',
  'user:node-type:project',
  'user:node-type:task',
  'user:node-type:note',
];

const LANGUAGES: readonly string[] = ['typescript', 'python', 'rust', 'json'];
const PRIORITIES: readonly string[] = ['low', 'medium', 'high'];
const TASK_STATUSES: readonly string[] = ['todo', 'in-progress', 'done'];
const PROJECT_STATUSES: readonly string[] = ['planning', 'in-progress', 'completed', 'on-hold'];

function createLcg(seed: number): () => number {
  // eslint-disable-next-line functional/no-let -- seedable LCG random number generator state
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

export function generateNodePayload(index: number, seed?: number): GeneratedNode {
  const rng = seed === undefined ? undefined : createLcg(seed + index * 1000);
  const nextRandom = (): number => (rng ? rng() : Math.random());

  const typeIndex = Math.floor(nextRandom() * NODE_TYPES.length);
  const rawType = NODE_TYPES[typeIndex % NODE_TYPES.length] ?? 'system:node-type:markdown';
  const type = asTypeId(rawType);
  const id = asNodeId(`node-seed-${index}`);

  if (rawType === 'system:node-type:text-block') {
    return {
      id,
      type,
      properties: {
        title: `Text Segment Block ${index}`,
        content: [`Demo text block segment ${index}`, `Additional details for segment ${index}`],
        tags: ['demo', 'text-segment'],
      },
    };
  }

  if (rawType === 'system:node-type:code-block') {
    const langIndex = Math.floor(nextRandom() * LANGUAGES.length);
    const language = LANGUAGES[langIndex % LANGUAGES.length] ?? 'typescript';
    return {
      id,
      type,
      properties: {
        title: `Code Snippet ${index}`,
        content: `// Sample code snippet ${index}\nfunction demoFunc_${index}() {\n  return ${index};\n}`,
        language,
        tags: ['demo', 'code', language],
      },
    };
  }

  if (rawType === 'user:node-type:project') {
    const statusIndex = Math.floor(nextRandom() * PROJECT_STATUSES.length);
    const status = PROJECT_STATUSES[statusIndex % PROJECT_STATUSES.length] ?? 'in-progress';
    return {
      id,
      type,
      properties: {
        title: `Project Alpha ${index}`,
        description: `Project definition and overview for component ${index}`,
        status,
        tags: ['project', 'roadmap'],
      },
    };
  }

  if (rawType === 'user:node-type:task') {
    const statusIndex = Math.floor(nextRandom() * TASK_STATUSES.length);
    const status = TASK_STATUSES[statusIndex % TASK_STATUSES.length] ?? 'todo';
    const prioIndex = Math.floor(nextRandom() * PRIORITIES.length);
    const priority = PRIORITIES[prioIndex % PRIORITIES.length] ?? 'medium';
    return {
      id,
      type,
      properties: {
        title: `Task Item ${index}`,
        content: `Detailed execution plan for task ${index}`,
        status,
        priority,
        dueDate: `2026-08-${10 + (index % 15)}`,
        tags: ['task', priority],
      },
    };
  }

  if (rawType === 'user:node-type:note') {
    return {
      id,
      type,
      properties: {
        title: `Knowledge Note ${index}`,
        content: `Captured notes and insights for index ${index}.\n- Item 1\n- Item 2`,
        tags: ['note', 'knowledge-base'],
      },
    };
  }

  // Default to MarkdownNode
  return {
    id,
    type: asTypeId('system:node-type:markdown'),
    properties: {
      title: `Demo Content ${index}`,
      content: `# Demo Markdown Header ${index}\nSample body content for node payload index ${index}.`,
      tags: ['demo', 'user-journey'],
    },
  };
}
