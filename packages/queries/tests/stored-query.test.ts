import { describe, it, expect } from 'bun:test';
import { createGraph } from '@canopy/graph';
import { addNode } from '@canopy/graph';
import {
  saveQueryDefinition,
  getQueryDefinition,
  listQueryDefinitions,
  executeStoredQuery,
} from '../src/stored';
import {
  createNodeId,
  asTypeId,
  createInstant,
  createGraphId,
  unwrap,
  isErr,
  asDeviceId,
} from '@canopy/graph';
import { pipe } from 'remeda';
import { Temporal } from 'temporal-polyfill';
import { query, nodes, where } from '../src/pipeline';

describe('Stored Queries', () => {
  it('should save and retrieve a query definition', () => {
    // createGraph calls bootstrap internally now
    let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

    const q = pipe(query(), nodes('node:type:task'), where('priority', 'eq', 'high'));

    const result = unwrap(
      saveQueryDefinition(graph, 'High Priority Tasks', q, {
        description: 'Finds all high priority tasks',
        nodeTypes: [asTypeId('node:type:task')],
        parameters: [],
        deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
      }),
    );

    graph = result.graph;
    const nodeId = result.nodeId;

    const retrievedQuery = unwrap(getQueryDefinition(graph, nodeId));
    expect(retrievedQuery).toEqual(q);

    const nodesList = listQueryDefinitions(graph);
    // 1 new query + 3 system queries = 4
    expect(nodesList.length).toBe(4);

    const myQuery = nodesList.find((n) => n.properties.get('name') === 'High Priority Tasks');
    expect(myQuery).toBeDefined();
  });

  it('should execute a stored query with parameter substitution', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

    // Add some sample data
    const taskType = asTypeId('node:type:task');
    const task1 = createNodeId();
    const task2 = createNodeId();

    graph = unwrap(
      addNode(
        graph,
        {
          id: task1,
          type: taskType,
          properties: new Map([
            ['name', 'Task 1'],
            ['priority', 'high'],
          ]),
          metadata: {
            created: createInstant(Temporal.Instant.from('2023-01-01T00:00:00Z')),
            modified: createInstant(Temporal.Instant.from('2023-01-01T00:00:00Z')),
            modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
          },
        },
        { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') },
      ),
    ).graph;

    graph = unwrap(
      addNode(
        graph,
        {
          id: task2,
          type: taskType,
          properties: new Map([
            ['name', 'Task 2'],
            ['priority', 'low'],
          ]),
          metadata: {
            created: createInstant(Temporal.Instant.from('2023-01-01T00:00:00Z')),
            modified: createInstant(Temporal.Instant.from('2023-01-01T00:00:00Z')),
            modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
          },
        },
        { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') },
      ),
    ).graph;

    const q = pipe(query(), nodes('node:type:task'), where('priority', 'eq', '$priority'));

    const saveResult = unwrap(
      saveQueryDefinition(graph, 'Tasks by Priority', q, {
        parameters: ['priority'],
        deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
      }),
    );
    graph = saveResult.graph;

    const result = unwrap(executeStoredQuery(graph, saveResult.nodeId, { priority: 'high' }));

    expect(result.nodes.length).toBe(1);
    const [firstHighNode] = result.nodes;
    if (firstHighNode === undefined) {
      throw new Error('Expected high priority node to be returned');
    }
    expect(firstHighNode.id).toBe(task1);

    const resultLow = unwrap(executeStoredQuery(graph, saveResult.nodeId, { priority: 'low' }));
    expect(resultLow.nodes.length).toBe(1);
    const [firstLowNode] = resultLow.nodes;
    if (firstLowNode === undefined) {
      throw new Error('Expected low priority node to be returned');
    }
    expect(firstLowNode.id).toBe(task2);
  });

  it('should return Error for non-existent or invalid query nodes', () => {
    const graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

    const result = getQueryDefinition(graph, createNodeId());
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toMatch(/not found/);
    }
  });
});
