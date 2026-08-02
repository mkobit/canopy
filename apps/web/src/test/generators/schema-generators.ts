import { asNodeId, type NodeId } from '@canopy/graph';

export type GeneratedPropertyDefinition = Readonly<{
  name: string;
  valueKind: string;
  required: boolean;
  description: string;
}>;

export type GeneratedNodeTypeSchema = Readonly<{
  id: NodeId;
  name: string;
  namespace: string;
  description: string;
  properties: readonly GeneratedPropertyDefinition[];
}>;

export type GeneratedEdgeTypeSchema = Readonly<{
  id: NodeId;
  name: string;
  namespace: string;
  description: string;
  sourceTypes?: readonly string[] | undefined;
  targetTypes?: readonly string[] | undefined;
}>;

export type GeneratedSchemaPayload = Readonly<{
  nodeTypes: readonly GeneratedNodeTypeSchema[];
  edgeTypes: readonly GeneratedEdgeTypeSchema[];
}>;

export type GenerateSchemaOptions = Readonly<{
  seed?: number | undefined;
}>;

const INITIAL_NODE_TYPES: readonly GeneratedNodeTypeSchema[] = [
  {
    id: asNodeId('user:node-type:project'),
    name: 'Project',
    namespace: 'user',
    description: 'A high-level project aggregate root containing child tasks and documentation.',
    properties: [
      {
        name: 'title',
        valueKind: 'text',
        required: true,
        description: 'The title of the project.',
      },
      {
        name: 'description',
        valueKind: 'text',
        required: false,
        description: 'A brief description of project scope and goals.',
      },
      {
        name: 'status',
        valueKind: 'text',
        required: false,
        description: 'Current status: planning, in-progress, completed, on-hold.',
      },
      {
        name: 'tags',
        valueKind: 'list',
        required: false,
        description: 'Categorization tags.',
      },
    ],
  },
  {
    id: asNodeId('user:node-type:task'),
    name: 'Task',
    namespace: 'user',
    description: 'An actionable work item associated with a project or note.',
    properties: [
      {
        name: 'title',
        valueKind: 'text',
        required: true,
        description: 'Task summary.',
      },
      {
        name: 'content',
        valueKind: 'text',
        required: false,
        description: 'Detailed instructions or execution steps.',
      },
      {
        name: 'status',
        valueKind: 'text',
        required: true,
        description: 'Task state: todo, in-progress, done.',
      },
      {
        name: 'priority',
        valueKind: 'text',
        required: false,
        description: 'Priority level: low, medium, high.',
      },
      {
        name: 'dueDate',
        valueKind: 'text',
        required: false,
        description: 'Completion target date.',
      },
      {
        name: 'tags',
        valueKind: 'list',
        required: false,
        description: 'Tags for filtering and search.',
      },
    ],
  },
  {
    id: asNodeId('user:node-type:note'),
    name: 'Note',
    namespace: 'user',
    description: 'An unstructured personal knowledge or research note.',
    properties: [
      {
        name: 'title',
        valueKind: 'text',
        required: true,
        description: 'Note headline.',
      },
      {
        name: 'content',
        valueKind: 'text',
        required: true,
        description: 'Body text or Markdown content.',
      },
      {
        name: 'tags',
        valueKind: 'list',
        required: false,
        description: 'Topics and tags.',
      },
    ],
  },
];

const INITIAL_EDGE_TYPES: readonly GeneratedEdgeTypeSchema[] = [
  {
    id: asNodeId('user:edge-type:child-of'),
    name: 'child_of',
    namespace: 'user',
    description: 'Parent-child containment relationship.',
    sourceTypes: ['user:node-type:task', 'system:node-type:text-block'],
    targetTypes: ['user:node-type:project', 'user:node-type:task'],
  },
  {
    id: asNodeId('user:edge-type:references'),
    name: 'references',
    namespace: 'user',
    description: 'General reference or link between knowledge nodes.',
    sourceTypes: ['user:node-type:note', 'user:node-type:task'],
    targetTypes: ['user:node-type:project', 'user:node-type:note', 'system:node-type:markdown'],
  },
  {
    id: asNodeId('user:edge-type:prerequisite'),
    name: 'prerequisite',
    namespace: 'user',
    description: 'Dependency edge where target must be satisfied before source.',
    sourceTypes: ['user:node-type:task'],
    targetTypes: ['user:node-type:task'],
  },
];

export function generateSchemaPayload(_options?: GenerateSchemaOptions): GeneratedSchemaPayload {
  return {
    nodeTypes: INITIAL_NODE_TYPES,
    edgeTypes: INITIAL_EDGE_TYPES,
  };
}
