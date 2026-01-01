import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '@canopy/core';
import { GraphQuery } from '../src';
import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import { NodeId, TypeId, EdgeId } from '@canopy/types';

describe('GraphQuery', () => {
    let doc: Y.Doc;
    let store: GraphStore;
    let query: GraphQuery;

    // Use valid UUIDs
    const aliceId = uuidv4() as NodeId;
    const bobId = uuidv4() as NodeId;
    const proj1Id = uuidv4() as NodeId;
    const proj2Id = uuidv4() as NodeId;
    const edge1Id = uuidv4() as EdgeId;
    const edge2Id = uuidv4() as EdgeId;

    beforeEach(() => {
        doc = new Y.Doc();
        store = new GraphStore(doc);
        query = new GraphQuery(store);

        // Add some data
        store.addNode({
            id: aliceId,
            type: 'Person' as TypeId,
            properties: new Map([['name', { kind: 'text', value: 'Alice' }]])
        });
        store.addNode({
            id: bobId,
            type: 'Person' as TypeId,
            properties: new Map([['name', { kind: 'text', value: 'Bob' }]])
        });
        store.addNode({
            id: proj1Id,
            type: 'Project' as TypeId,
            properties: new Map([['status', { kind: 'text', value: 'active' }]])
        });
        store.addNode({
            id: proj2Id,
            type: 'Project' as TypeId,
            properties: new Map([['status', { kind: 'text', value: 'archived' }]])
        });

        store.addEdge({
            id: edge1Id,
            type: 'ATTENDED' as TypeId,
            source: aliceId,
            target: proj1Id,
            properties: new Map([['role', { kind: 'text', value: 'Lead' }]])
        });
        store.addEdge({
            id: edge2Id,
            type: 'ATTENDED' as TypeId,
            source: bobId,
            target: proj1Id,
            properties: new Map([['role', { kind: 'text', value: 'Dev' }]])
        });
    });

    it('findNodes by type', () => {
        const persons = query.findNodes('Person');
        expect(persons.length).toBe(2);
    });

    it('findNodes by properties', () => {
        const activeProjects = query.findNodes('Project', { status: { kind: 'text', value: 'active' } });
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
