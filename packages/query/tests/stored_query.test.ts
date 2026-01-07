import { describe, it, expect } from 'vitest';
import { createGraph } from '@canopy/core';
import { bootstrap } from '@canopy/core';
import { addNode } from '@canopy/core';
import { QueryEngine } from '../src/engine';
import { saveQueryDefinition, getQueryDefinition, listQueryDefinitions, executeStoredQuery } from '../src/stored';
import { Query } from '../src/model';
import { createNodeId, asTypeId, createInstant } from '@canopy/types';

describe('Stored Queries', () => {
    it('should save and retrieve a query definition', () => {
        let graph = createGraph();
        graph = bootstrap(graph);

        const query: Query = {
            steps: [
                { kind: 'node-scan', type: 'node:type:task' },
                { kind: 'filter', predicate: { property: 'priority', operator: 'eq', value: 'high' } }
            ]
        };

        const result = saveQueryDefinition(graph, 'High Priority Tasks', query, {
            description: 'Finds all high priority tasks',
            nodeTypes: ['node:type:task'],
            parameters: []
        });

        graph = result.graph;
        const nodeId = result.nodeId;

        const retrievedQuery = getQueryDefinition(graph, nodeId);
        expect(retrievedQuery).toEqual(query);

        const nodes = listQueryDefinitions(graph);
        // 1 new query + 3 system queries = 4
        expect(nodes.length).toBe(4);

        const myQuery = nodes.find(n => n.properties.get('name')?.kind === 'text' && n.properties.get('name')?.value === 'High Priority Tasks');
        expect(myQuery).toBeDefined();
    });

    it('should execute a stored query with parameter substitution', () => {
        let graph = createGraph();
        graph = bootstrap(graph);

        // Add some sample data
        const taskType = asTypeId('node:type:task');
        const task1 = createNodeId();
        const task2 = createNodeId();

        graph = addNode(graph, {
             id: task1,
             type: taskType,
             properties: new Map([
                 ['name', { kind: 'text', value: 'Task 1' }],
                 ['priority', { kind: 'text', value: 'high' }]
             ]),
             metadata: { created: createInstant(), modified: createInstant() }
        });

        graph = addNode(graph, {
             id: task2,
             type: taskType,
             properties: new Map([
                 ['name', { kind: 'text', value: 'Task 2' }],
                 ['priority', { kind: 'text', value: 'low' }]
             ]),
             metadata: { created: createInstant(), modified: createInstant() }
        });

        const query: Query = {
            steps: [
                { kind: 'node-scan', type: 'node:type:task' },
                { kind: 'filter', predicate: { property: 'priority', operator: 'eq', value: '$priority' } }
            ]
        };

        const saveResult = saveQueryDefinition(graph, 'Tasks by Priority', query, {
            parameters: ['priority']
        });
        graph = saveResult.graph;

        const engine = new QueryEngine(graph);
        const result = executeStoredQuery(engine, graph, saveResult.nodeId, { priority: 'high' });

        expect(result.nodes.length).toBe(1);
        expect(result.nodes[0].id).toBe(task1);

        const resultLow = executeStoredQuery(engine, graph, saveResult.nodeId, { priority: 'low' });
        expect(resultLow.nodes.length).toBe(1);
        expect(resultLow.nodes[0].id).toBe(task2);
    });

    it('should throw error for non-existent or invalid query nodes', () => {
        let graph = createGraph();
        graph = bootstrap(graph);

        expect(() => getQueryDefinition(graph, createNodeId())).toThrow(/not found/);
    });
});
