import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '@canopy/core';
import { GraphQuery } from '../src';
import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';

describe('GraphQuery', () => {
    let doc: Y.Doc;
    let store: GraphStore;
    let query: GraphQuery;

    // Use valid UUIDs
    const aliceId = uuidv4();
    const bobId = uuidv4();
    const proj1Id = uuidv4();
    const proj2Id = uuidv4();
    const edge1Id = uuidv4();
    const edge2Id = uuidv4();

    beforeEach(() => {
        doc = new Y.Doc();
        store = new GraphStore(doc);
        query = new GraphQuery(store);

        // Setup types
        store.addNode({
            type: 'NodeType',
            properties: { name: 'Person', properties: [{ name: 'name', type: 'string' }] }
        });
         store.addNode({
            type: 'NodeType',
            properties: { name: 'Project', properties: [{ name: 'status', type: 'string' }] }
        });
        store.addNode({
            type: 'EdgeType',
            properties: { name: 'ATTENDED', properties: [{ name: 'role', type: 'string' }] }
        });

        // Add some data
        store.addNode({ id: aliceId, type: 'Person', properties: { name: 'Alice' } });
        store.addNode({ id: bobId, type: 'Person', properties: { name: 'Bob' } });
        store.addNode({ id: proj1Id, type: 'Project', properties: { status: 'active' } });
        store.addNode({ id: proj2Id, type: 'Project', properties: { status: 'archived' } });

        store.addEdge({ id: edge1Id, type: 'ATTENDED', source: aliceId, target: proj1Id, properties: { role: 'Lead' } });
        store.addEdge({ id: edge2Id, type: 'ATTENDED', source: bobId, target: proj1Id, properties: { role: 'Dev' } });
    });

    it('findNodes by type', () => {
        const persons = query.findNodes('Person');
        expect(persons.length).toBe(2);
    });

    it('findNodes by properties', () => {
        const activeProjects = query.findNodes('Project', { status: 'active' });
        expect(activeProjects.length).toBe(1);
        expect(activeProjects[0].id).toBe(proj1Id);
    });

    it('findEdges', () => {
        const edges = query.findEdges('ATTENDED');
        expect(edges.length).toBe(2);
    });

    it('findEdges with source', () => {
         const edges = query.findEdges('ATTENDED', aliceId);
         expect(edges.length).toBe(1);
         expect(edges[0].target).toBe(proj1Id);
    });

    it('getOutgoingEdges', () => {
        const outgoing = query.getOutgoingEdges(aliceId);
        expect(outgoing.length).toBe(1);
        expect(outgoing[0].target).toBe(proj1Id);
    });

    it('getIncomingEdges', () => {
        const incoming = query.getIncomingEdges(proj1Id);
        expect(incoming.length).toBe(2);
    });
});
