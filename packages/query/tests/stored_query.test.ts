import { describe, it, expect } from 'vitest';
import { createGraph } from '@canopy/core';
import { addNode } from '@canopy/core';
import { QueryEngine } from '../src/engine';
import { saveQueryDefinition, getQueryDefinition, listQueryDefinitions, executeStoredQuery } from '../src/stored';
import { Query } from '../src/model';
import { createNodeId, asTypeId, createInstant, createGraphId, unwrap, isErr } from '@canopy/types';

describe('Stored Queries', () => {
    it('should save and retrieve a query definition', () => {
        // createGraph calls bootstrap internally now
        let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

        const query: Query = {
            steps: [
                { kind: 'node-scan', type: 'node:type:task' },
                { kind: 'filter', predicate: { property: 'priority', operator: 'eq', value: 'high' } }
            ]
        };

        const result = unwrap(saveQueryDefinition(graph, 'High Priority Tasks', query, {
            description: 'Finds all high priority tasks',
            nodeTypes: ['node:type:task'],
            parameters: []
        }));

        graph = result.graph;
        const nodeId = result.nodeId;

        const retrievedQuery = unwrap(getQueryDefinition(graph, nodeId));
        expect(retrievedQuery).toEqual(query);

        const nodes = listQueryDefinitions(graph);
        // 1 new query + 3 system queries = 4
        expect(nodes.length).toBe(4);

        const myQuery = nodes.find(n => n.properties.get('name')?.kind === 'text' && n.properties.get('name')?.value === 'High Priority Tasks');
        expect(myQuery).toBeDefined();
    });

    it('should execute a stored query with parameter substitution', () => {
        let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

        // Add some sample data
        const taskType = asTypeId('node:type:task');
        const task1 = createNodeId();
        const task2 = createNodeId();

        graph = unwrap(addNode(graph, {
             id: task1,
             type: taskType,
             properties: new Map([
                 ['name', { kind: 'text', value: 'Task 1' }],
                 ['priority', { kind: 'text', value: 'high' }]
             ]),
             metadata: { created: createInstant(new Date('2023-01-01T00:00:00Z')), modified: createInstant(new Date('2023-01-01T00:00:00Z')) }
        }));

        graph = unwrap(addNode(graph, {
             id: task2,
             type: taskType,
             properties: new Map([
                 ['name', { kind: 'text', value: 'Task 2' }],
                 ['priority', { kind: 'text', value: 'low' }]
             ]),
             metadata: { created: createInstant(new Date('2023-01-01T00:00:00Z')), modified: createInstant(new Date('2023-01-01T00:00:00Z')) }
        }));

        const query: Query = {
            steps: [
                { kind: 'node-scan', type: 'node:type:task' },
                { kind: 'filter', predicate: { property: 'priority', operator: 'eq', value: '$priority' } }
            ]
        };

        const saveResult = unwrap(saveQueryDefinition(graph, 'Tasks by Priority', query, {
            parameters: ['priority']
        }));
        graph = saveResult.graph;

        const engine = new QueryEngine(graph);
        const result = unwrap(executeStoredQuery(engine, graph, saveResult.nodeId, { priority: 'high' }));

        expect(result.nodes.length).toBe(1);
        expect(result.nodes[0].id).toBe(task1);

        const resultLow = unwrap(executeStoredQuery(engine, graph, saveResult.nodeId, { priority: 'low' }));
        expect(resultLow.nodes.length).toBe(1);
        expect(resultLow.nodes[0].id).toBe(task2);
    });

    it('should return Error for non-existent or invalid query nodes', () => {
        let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

        const result = getQueryDefinition(graph, createNodeId());
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error.message).toMatch(/not found/);
        }
    });
});
