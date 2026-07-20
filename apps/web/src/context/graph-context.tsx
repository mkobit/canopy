import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type {
  Graph,
  GraphId,
  NodeId,
  EdgeId,
  PropertyValue,
  Node,
  Edge,
  Result,
  GraphResult,
  GraphSession,
  ValidationError,
  CreateNamespaceInput,
  CreateNodeTypeInput,
  CreateEdgeTypeInput,
  CreatePropertyTypeInput,
} from '@canopy/graph';
import {
  ok,
  err,
  fromAsyncThrowable,
  createGraphSession,
  createNodeId,
  createEdgeId,
  createInstant,
  addNode,
  addEdge,
  updateNode,
  removeNode,
  createNamespace as createNamespaceOp,
  createNodeType as createNodeTypeOp,
  createEdgeType as createEdgeTypeOp,
  createPropertyType as createPropertyTypeOp,
} from '@canopy/graph';
import { useStorage } from './storage-context';
import { z } from 'zod';
import { TypeIdSchema, PropertyValueSchema } from '@canopy/graph';

function validationErrorToError(validationError: ValidationError): Error {
  return new Error(
    validationError.path.length > 0
      ? `${validationError.path.join('.')}: ${validationError.message}`
      : validationError.message,
  );
}

/** Commits a node-creating op's events and extracts the created node's id from the delta. */
async function commitCreatedNode(
  session: GraphSession,
  opResult: Result<GraphResult<Graph>, ValidationError>,
): Promise<Result<NodeId, Error>> {
  if (!opResult.ok) return err(validationErrorToError(opResult.error));

  const commitResult = await session.commit(opResult.value.events);
  if (!commitResult.ok) return commitResult;

  const created = opResult.value.events.find((event) => event.type === 'NodeCreated');
  if (!created) return err(new Error('Expected op to produce a NodeCreated event'));
  return ok(created.id);
}

interface GraphContextState {
  readonly graph: Graph | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

interface GraphContextActions {
  readonly loadGraph: (graphId: GraphId) => Promise<Result<void, Error>>;
  readonly closeGraph: () => Result<void, Error>;
  readonly createNode: (
    type: string,
    properties?: Record<string, unknown>,
  ) => Promise<Result<NodeId, Error>>;
  readonly createEdge: (
    type: string,
    source: NodeId,
    target: NodeId,
    properties?: Record<string, unknown>,
  ) => Promise<Result<EdgeId, Error>>;
  readonly updateNodeProperties: (
    nodeId: NodeId,
    changes: ReadonlyMap<string, PropertyValue>,
  ) => Promise<Result<void, Error>>;
  readonly deleteNode: (nodeId: NodeId) => Promise<Result<void, Error>>;
  readonly createNamespace: (input: CreateNamespaceInput) => Promise<Result<NodeId, Error>>;
  readonly createNodeType: (input: CreateNodeTypeInput) => Promise<Result<NodeId, Error>>;
  readonly createEdgeType: (input: CreateEdgeTypeInput) => Promise<Result<NodeId, Error>>;
  readonly createPropertyType: (input: CreatePropertyTypeInput) => Promise<Result<NodeId, Error>>;
  readonly session: GraphSession | null;
}

type GraphContextType = GraphContextState & GraphContextActions;

const CreateNodeInputSchema = z.object({
  type: TypeIdSchema,
  properties: z.record(z.string(), PropertyValueSchema).optional(),
});

const CreateEdgeInputSchema = z.object({
  type: TypeIdSchema,
  properties: z.record(z.string(), PropertyValueSchema).optional(),
});

const GraphContext = createContext<GraphContextType>({
  graph: null,
  isLoading: false,
  error: null,
  loadGraph: async () => ok(undefined),
  closeGraph: () => ok(undefined),
  createNode: async () => err(new Error('Not initialized')),
  createEdge: async () => err(new Error('Not initialized')),
  updateNodeProperties: async () => err(new Error('Not initialized')),
  deleteNode: async () => err(new Error('Not initialized')),
  createNamespace: async () => err(new Error('Not initialized')),
  createNodeType: async () => err(new Error('Not initialized')),
  createEdgeType: async () => err(new Error('Not initialized')),
  createPropertyType: async () => err(new Error('Not initialized')),
  session: null,
});

// eslint-disable-next-line max-lines-per-function
export const GraphProvider: React.FC<Readonly<{ children: React.ReactNode }>> = ({ children }) => {
  const { eventLog, deviceId } = useStorage();
  const sessionRef = useRef<GraphSession | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  const [graph, setGraph] = useState<Graph | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadGraph = useCallback(
    async (graphId: GraphId): Promise<Result<void, Error>> => {
      if (!eventLog) return err(new Error('Storage not available'));

      setIsLoading(true);
      setError(null);

      const result = await fromAsyncThrowable(async () => {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }

        const session = createGraphSession(eventLog, graphId, deviceId);
        const loadResult = await session.load();

        if (!loadResult.ok) throw loadResult.error;

        sessionRef.current = session;
        unsubscribeRef.current = session.subscribe((updatedGraph) => {
          setGraph(updatedGraph);
          return undefined;
        });

        setGraph(loadResult.value);
        return undefined;
      });

      if (!result.ok) {
        console.error('Failed to load graph:', result.error);
        setError(result.error);
      }

      setIsLoading(false);
      return result;
    },
    [eventLog, deviceId],
  );

  const closeGraph = useCallback((): Result<void, Error> => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    sessionRef.current = null;
    setGraph(null);
    return ok(undefined);
  }, []);

  const createNode = useCallback(
    async (
      type: string,
      properties: Record<string, unknown> = {},
    ): Promise<Result<NodeId, Error>> => {
      const session = sessionRef.current;
      if (!session) return err(new Error('No graph loaded'));

      return fromAsyncThrowable(async () => {
        const input = CreateNodeInputSchema.parse({ type, properties });
        const propsMap = new Map<string, PropertyValue>(
          input.properties ? Object.entries(input.properties) : [],
        );
        const node: Node = {
          id: createNodeId(),
          type: input.type,
          properties: propsMap,
          metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
        };

        const opResult = addNode(session.graph(), node, { deviceId });

        if (!opResult.ok) throw opResult.error;

        const commitResult = await session.commit(opResult.value.events);

        if (!commitResult.ok) throw commitResult.error;

        return node.id;
      });
    },
    [deviceId],
  );

  const createEdge = useCallback(
    async (
      type: string,
      source: NodeId,
      target: NodeId,
      properties: Record<string, unknown> = {},
    ): Promise<Result<EdgeId, Error>> => {
      const session = sessionRef.current;
      if (!session) return err(new Error('No graph loaded'));

      return fromAsyncThrowable(async () => {
        const input = CreateEdgeInputSchema.parse({ type, properties });
        const propsMap = new Map<string, PropertyValue>(
          input.properties ? Object.entries(input.properties) : [],
        );
        const edge: Edge = {
          id: createEdgeId(),
          type: input.type,
          source,
          target,
          properties: propsMap,
          metadata: { created: createInstant(), modified: createInstant(), modifiedBy: deviceId },
        };

        const opResult = addEdge(session.graph(), edge, { deviceId });

        if (!opResult.ok) throw opResult.error;

        const commitResult = await session.commit(opResult.value.events);

        if (!commitResult.ok) throw commitResult.error;

        return edge.id;
      });
    },
    [deviceId],
  );

  const updateNodeProperties = useCallback(
    async (
      nodeId: NodeId,
      changes: ReadonlyMap<string, PropertyValue>,
    ): Promise<Result<void, Error>> => {
      const session = sessionRef.current;
      if (!session) return err(new Error('No graph loaded'));

      const opResult = updateNode(
        session.graph(),
        nodeId,
        (node) => ({ ...node, properties: new Map([...node.properties, ...changes]) }),
        { deviceId },
      );
      if (!opResult.ok) return err(opResult.error);

      const commitResult = await session.commit(opResult.value.events);
      if (!commitResult.ok) return err(commitResult.error);
      return ok(undefined);
    },
    [deviceId],
  );

  const deleteNode = useCallback(
    async (nodeId: NodeId): Promise<Result<void, Error>> => {
      const session = sessionRef.current;
      if (!session) return err(new Error('No graph loaded'));

      const opResult = removeNode(session.graph(), nodeId, { deviceId });
      if (!opResult.ok) return err(opResult.error);

      const commitResult = await session.commit(opResult.value.events);
      if (!commitResult.ok) return err(commitResult.error);
      return ok(undefined);
    },
    [deviceId],
  );

  const createNamespace = useCallback(
    (input: CreateNamespaceInput): Promise<Result<NodeId, Error>> => {
      const session = sessionRef.current;
      if (!session) return Promise.resolve(err(new Error('No graph loaded')));
      return commitCreatedNode(session, createNamespaceOp(session.graph(), input, { deviceId }));
    },
    [deviceId],
  );

  const createNodeType = useCallback(
    (input: CreateNodeTypeInput): Promise<Result<NodeId, Error>> => {
      const session = sessionRef.current;
      if (!session) return Promise.resolve(err(new Error('No graph loaded')));
      return commitCreatedNode(session, createNodeTypeOp(session.graph(), input, { deviceId }));
    },
    [deviceId],
  );

  const createEdgeType = useCallback(
    (input: CreateEdgeTypeInput): Promise<Result<NodeId, Error>> => {
      const session = sessionRef.current;
      if (!session) return Promise.resolve(err(new Error('No graph loaded')));
      return commitCreatedNode(session, createEdgeTypeOp(session.graph(), input, { deviceId }));
    },
    [deviceId],
  );

  const createPropertyType = useCallback(
    (input: CreatePropertyTypeInput): Promise<Result<NodeId, Error>> => {
      const session = sessionRef.current;
      if (!session) return Promise.resolve(err(new Error('No graph loaded')));
      return commitCreatedNode(session, createPropertyTypeOp(session.graph(), input, { deviceId }));
    },
    [deviceId],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      return undefined;
    };
  }, []);

  return (
    <GraphContext.Provider
      value={{
        graph,
        isLoading,
        error,
        loadGraph,
        closeGraph,
        createNode,
        createEdge,
        updateNodeProperties,
        deleteNode,
        createNamespace,
        createNodeType,
        createEdgeType,
        createPropertyType,
        session: sessionRef.current,
      }}
    >
      {children}
    </GraphContext.Provider>
  );
};

export const useGraph = () => useContext(GraphContext);
