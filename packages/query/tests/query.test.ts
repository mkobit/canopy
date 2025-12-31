import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '@canopy/core';
import { GraphQuery } from '../src';
import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import { asNodeId, asTypeId, asEdgeId } from '@canopy/types';

describe('GraphQuery', () => {
    let doc: Y.Doc;
    let store: GraphStore;
    let query: GraphQuery;

    // Use valid UUIDs
    const aliceId = asNodeId(uuidv4());
    const bobId = asNodeId(uuidv4());
    const proj1Id = asNodeId(uuidv4());
    const proj2Id = asNodeId(uuidv4());
    const edge1Id = asEdgeId(uuidv4());
    const edge2Id = asEdgeId(uuidv4());

    beforeEach(() => {
        doc = new Y.Doc();
        store = new GraphStore(doc);
        query = new GraphQuery(store);

        // Add some data
        store.addNode({
            id: aliceId,
            type: asTypeId('Person'),
            properties: new Map([['name', { kind: 'text', value: 'Alice' }]])
        });
        store.addNode({
            id: bobId,
            type: asTypeId('Person'),
            properties: new Map([['name', { kind: 'text', value: 'Bob' }]])
        });
        store.addNode({
            id: proj1Id,
            type: asTypeId('Project'),
            properties: new Map([['status', { kind: 'text', value: 'active' }]])
        });
        store.addNode({
            id: proj2Id,
            type: asTypeId('Project'),
            properties: new Map([['status', { kind: 'text', value: 'archived' }]])
        });

        store.addEdge({
            id: edge1Id,
            type: asTypeId('ATTENDED'),
            source: aliceId,
            target: proj1Id,
            properties: new Map([['role', { kind: 'text', value: 'Lead' }]])
        });
        store.addEdge({
            id: edge2Id,
            type: asTypeId('ATTENDED'),
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
