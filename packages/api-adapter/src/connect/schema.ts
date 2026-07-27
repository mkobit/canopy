export type ConnectServiceMethod = Readonly<{
  name: string;
  requestType: string;
  responseType: string;
  isStreaming: boolean;
}>;

export type ConnectServiceDescriptor = Readonly<{
  typeName: string;
  methods: readonly ConnectServiceMethod[];
}>;

export { PROTO_SERVICES_SDL } from './proto-sdl';

export const CONNECT_SERVICE_DESCRIPTORS: readonly ConnectServiceDescriptor[] = [
  {
    typeName: 'canopy.api.v1.NodeService',
    methods: [
      {
        name: 'getNodeById',
        requestType: 'GetNodeByIdRequest',
        responseType: 'NodeResponse',
        isStreaming: false,
      },
      {
        name: 'getNodesByType',
        requestType: 'GetNodesByTypeRequest',
        responseType: 'NodeListResponse',
        isStreaming: false,
      },
      {
        name: 'getNodesByProperty',
        requestType: 'GetNodesByPropertyRequest',
        responseType: 'NodeListResponse',
        isStreaming: false,
      },
    ],
  },
  {
    typeName: 'canopy.api.v1.EdgeService',
    methods: [
      {
        name: 'getInboundEdges',
        requestType: 'GetInboundEdgesRequest',
        responseType: 'EdgeListResponse',
        isStreaming: false,
      },
      {
        name: 'getOutboundEdges',
        requestType: 'GetOutboundEdgesRequest',
        responseType: 'EdgeListResponse',
        isStreaming: false,
      },
    ],
  },
  {
    typeName: 'canopy.api.v1.PropertyService',
    methods: [
      {
        name: 'executeTraversalQuery',
        requestType: 'ExecuteTraversalQueryRequest',
        responseType: 'TraversalResponse',
        isStreaming: false,
      },
    ],
  },
  {
    typeName: 'canopy.api.v1.GraphMutationService',
    methods: [
      {
        name: 'createNode',
        requestType: 'CreateNodeRequest',
        responseType: 'MutationResultResponse',
        isStreaming: false,
      },
      {
        name: 'updateNodeProperties',
        requestType: 'UpdatePropertiesRequest',
        responseType: 'MutationResultResponse',
        isStreaming: false,
      },
      {
        name: 'deleteNode',
        requestType: 'DeleteNodeRequest',
        responseType: 'MutationResultResponse',
        isStreaming: false,
      },
      {
        name: 'createEdge',
        requestType: 'CreateEdgeRequest',
        responseType: 'MutationResultResponse',
        isStreaming: false,
      },
      {
        name: 'deleteEdge',
        requestType: 'DeleteEdgeRequest',
        responseType: 'MutationResultResponse',
        isStreaming: false,
      },
    ],
  },
  {
    typeName: 'canopy.api.v1.EventStreamService',
    methods: [
      {
        name: 'subscribeEventStream',
        requestType: 'EventStreamRequest',
        responseType: 'EventStreamItem',
        isStreaming: true,
      },
      {
        name: 'replayEventStream',
        requestType: 'EventStreamRequest',
        responseType: 'EventStreamItem',
        isStreaming: true,
      },
    ],
  },
];
