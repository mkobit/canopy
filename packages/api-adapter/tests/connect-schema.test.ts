import { describe, expect, it } from 'bun:test';
import { CONNECT_SERVICE_DESCRIPTORS, PROTO_SERVICES_SDL } from '../src/connect/schema';

describe('Connect Protobuf schema definition', () => {
  it('defines valid Protobuf SDL string', () => {
    expect(PROTO_SERVICES_SDL).toContain('syntax = "proto3";');
    expect(PROTO_SERVICES_SDL).toContain('service NodeService');
    expect(PROTO_SERVICES_SDL).toContain('service EdgeService');
    expect(PROTO_SERVICES_SDL).toContain('service PropertyService');
    expect(PROTO_SERVICES_SDL).toContain('service GraphMutationService');
    expect(PROTO_SERVICES_SDL).toContain('service EventStreamService');
  });

  it('provides complete Connect service descriptors', () => {
    expect(CONNECT_SERVICE_DESCRIPTORS.length).toBe(5);
    const serviceNames = CONNECT_SERVICE_DESCRIPTORS.map((descriptor) => descriptor.typeName);
    expect(serviceNames).toContain('canopy.api.v1.NodeService');
    expect(serviceNames).toContain('canopy.api.v1.EdgeService');
    expect(serviceNames).toContain('canopy.api.v1.PropertyService');
    expect(serviceNames).toContain('canopy.api.v1.GraphMutationService');
    expect(serviceNames).toContain('canopy.api.v1.EventStreamService');
  });

  it('includes expected methods for each service descriptor', () => {
    const nodeService = CONNECT_SERVICE_DESCRIPTORS.find(
      (d) => d.typeName === 'canopy.api.v1.NodeService',
    );
    expect(nodeService).toBeDefined();
    expect(nodeService?.methods.map((m) => m.name)).toEqual([
      'getNodeById',
      'getNodesByType',
      'getNodesByProperty',
    ]);

    const edgeService = CONNECT_SERVICE_DESCRIPTORS.find(
      (d) => d.typeName === 'canopy.api.v1.EdgeService',
    );
    expect(edgeService).toBeDefined();
    expect(edgeService?.methods.map((m) => m.name)).toEqual([
      'getInboundEdges',
      'getOutboundEdges',
    ]);

    const propertyService = CONNECT_SERVICE_DESCRIPTORS.find(
      (d) => d.typeName === 'canopy.api.v1.PropertyService',
    );
    expect(propertyService).toBeDefined();
    expect(propertyService?.methods.map((m) => m.name)).toEqual(['executeTraversalQuery']);

    const mutationService = CONNECT_SERVICE_DESCRIPTORS.find(
      (d) => d.typeName === 'canopy.api.v1.GraphMutationService',
    );
    expect(mutationService).toBeDefined();
    expect(mutationService?.methods.map((m) => m.name)).toEqual([
      'createNode',
      'updateNodeProperties',
      'deleteNode',
      'createEdge',
      'deleteEdge',
    ]);

    const eventStreamService = CONNECT_SERVICE_DESCRIPTORS.find(
      (d) => d.typeName === 'canopy.api.v1.EventStreamService',
    );
    expect(eventStreamService).toBeDefined();
    expect(eventStreamService?.methods.map((m) => m.name)).toEqual([
      'subscribeEventStream',
      'replayEventStream',
    ]);
  });
});
