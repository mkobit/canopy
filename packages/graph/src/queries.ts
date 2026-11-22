import type { Graph } from './graph';
import type { Node } from './node';
import type { Edge } from './edge';
import type { ShapeId, NodeId, Namespace } from './identifiers';
import type { PropertyValue } from './properties';
import type { ShapeDefinition, ShapePropertyBinding } from './definitions';
import type { Result } from './result';
import { SYSTEM_IDS } from './system';
import { asNodeId, asShapeId, asNamespace } from './factories';
import { ok, err as error, fromThrowable } from './result';
import { ShapePropertyBindingSchema } from './schemas';
import { parseNamespace } from './resolve-namespace';
import { canonicalizeUri } from './url';
import { filter } from 'remeda';
import { findNode } from './utilities';

export type ShapeResolveError = Readonly<{
  code: 'SHAPE_NOT_FOUND' | 'SHAPE_KIND_MISMATCH' | 'SHAPE_MALFORMED';
  message: string;
}>;

function extractShapeIdList(value: PropertyValue | undefined): readonly ShapeId[] {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => asShapeId(typeof item === 'string' ? item : 'unknown'));
  }
  if (typeof value === 'string') {
    const result = fromThrowable(() => JSON.parse(value) as readonly string[]);
    return result.ok && Array.isArray(result.value) ? result.value.map(asShapeId) : [];
  }
  return [];
}

function extractNamespace(graph: Readonly<Graph>, value: PropertyValue | undefined): Namespace {
  if (typeof value === 'string') {
    const parsed = parseNamespace(graph, value);
    if (parsed.ok) {
      return parsed.value;
    }
  }
  return asNamespace('user');
}

function parseShapeBindings(
  rawProperties: PropertyValue | undefined,
  shapeId: ShapeId,
): Result<readonly ShapePropertyBinding[], ShapeResolveError> {
  if (rawProperties === undefined) {
    return ok([]);
  }
  if (typeof rawProperties !== 'string') {
    return error({
      code: 'SHAPE_MALFORMED',
      message: `Shape '${shapeId}' properties must be a JSON string`,
    });
  }
  const parsedJson = fromThrowable(() => JSON.parse(rawProperties));
  if (!parsedJson.ok || !Array.isArray(parsedJson.value)) {
    return error({
      code: 'SHAPE_MALFORMED',
      message: `Shape '${shapeId}' properties must be a valid JSON array`,
    });
  }
  const parsedBindings = ShapePropertyBindingSchema.array().safeParse(parsedJson.value);
  if (!parsedBindings.success) {
    return error({
      code: 'SHAPE_MALFORMED',
      message: `Shape '${shapeId}' has malformed property bindings: ${parsedBindings.error.issues.map((issue) => issue.message).join('; ')}`,
    });
  }
  return ok(parsedBindings.data);
}

/**
Returns all Shape definition nodes, optionally filtered by `entityKind`.
*/
export function getShapes(
  graph: Readonly<Graph>,
  entityKind?: 'node' | 'edge' | undefined,
): readonly Node[] {
  return filter(
    [...graph.nodes.values()],
    (node) =>
      node.shape === SYSTEM_IDS.SHAPE &&
      (entityKind === undefined || node.properties.get('entityKind') === entityKind),
  );
}

/**
Returns a Shape definition node by its exact ShapeId.
*/
export function getShape(graph: Readonly<Graph>, shapeId: ShapeId): Node | undefined {
  const node = graph.nodes.get(asNodeId(shapeId));
  return node?.shape === SYSTEM_IDS.SHAPE ? node : undefined;
}

/**
Finds a Shape definition node by name and entityKind.
*/
export function findShapeByName(
  graph: Readonly<Graph>,
  name: string,
  entityKind: 'node' | 'edge',
): Node | undefined {
  return findNode(
    graph,
    (node) =>
      node.shape === SYSTEM_IDS.SHAPE &&
      node.properties.get('entityKind') === entityKind &&
      node.properties.get('name') === name,
  );
}

/**
Resolves and decodes a Shape definition node into a structured `ShapeDefinition`.
*/
export function resolveShape(
  graph: Readonly<Graph>,
  shapeId: ShapeId,
): Result<ShapeDefinition, ShapeResolveError> {
  const node = graph.nodes.get(asNodeId(shapeId));
  if (!node) {
    return error({
      code: 'SHAPE_NOT_FOUND',
      message: `Shape '${shapeId}' not found`,
    });
  }
  if (node.shape !== SYSTEM_IDS.SHAPE) {
    return error({
      code: 'SHAPE_KIND_MISMATCH',
      message: `Node '${shapeId}' is not a Shape definition (shape is '${node.shape ?? 'open'}')`,
    });
  }

  const rawEntityKind = node.properties.get('entityKind');
  if (rawEntityKind !== 'node' && rawEntityKind !== 'edge') {
    return error({
      code: 'SHAPE_MALFORMED',
      message: `Shape '${shapeId}' must have entityKind 'node' or 'edge'`,
    });
  }
  const entityKind: 'node' | 'edge' = rawEntityKind === 'node' ? 'node' : 'edge';

  const rawClosed = node.properties.get('closed');
  if (rawClosed !== undefined && typeof rawClosed !== 'boolean') {
    return error({
      code: 'SHAPE_MALFORMED',
      message: `Shape '${shapeId}' property 'closed' must be a boolean`,
    });
  }
  const closed = rawClosed === true;

  const bindingsResult = parseShapeBindings(node.properties.get('properties'), shapeId);
  if (!bindingsResult.ok) {
    return bindingsResult;
  }

  const rawSchemaOrgUri = node.properties.get('schemaOrgUri');
  const schemaOrgUriResult = (() => {
    if (rawSchemaOrgUri === undefined) return ok(undefined);
    if (typeof rawSchemaOrgUri !== 'string') {
      return error({
        code: 'SHAPE_MALFORMED',
        message: `Shape '${shapeId}' property 'schemaOrgUri' must be a string`,
      } satisfies ShapeResolveError);
    }
    const uri = canonicalizeUri(rawSchemaOrgUri);
    return uri.ok
      ? ok(uri.value)
      : error({
          code: 'SHAPE_MALFORMED',
          message: `Shape '${shapeId}' has invalid schemaOrgUri: ${uri.error.message}`,
        } satisfies ShapeResolveError);
  })();
  if (!schemaOrgUriResult.ok) {
    return schemaOrgUriResult;
  }

  const nameProperty = node.properties.get('name');
  const descriptionProperty = node.properties.get('description');
  const statusProperty = node.properties.get('status');
  const inverseProperty = node.properties.get('inverse');

  return ok({
    id: asShapeId(node.id),
    name: typeof nameProperty === 'string' ? nameProperty : 'Unknown',
    namespace: extractNamespace(graph, node.properties.get('namespace')),
    description: typeof descriptionProperty === 'string' ? descriptionProperty : undefined,
    entityKind,
    closed,
    properties: bindingsResult.value,
    schemaOrgUri: schemaOrgUriResult.value,
    status: statusProperty === 'inactive' ? 'inactive' : 'active',
    ...(entityKind === 'node'
      ? {
          node: {
            validOutgoingEdges: extractShapeIdList(node.properties.get('validOutgoingEdges')),
            validIncomingEdges: extractShapeIdList(node.properties.get('validIncomingEdges')),
          },
        }
      : {
          edge: {
            sourceTypes: extractShapeIdList(node.properties.get('sourceTypes')),
            targetTypes: extractShapeIdList(node.properties.get('targetTypes')),
            transitive: node.properties.get('transitive') === true,
            inverse: typeof inverseProperty === 'string' ? asShapeId(inverseProperty) : undefined,
          },
        }),
  });
}

/**
Returns all nodes whose shape matches the given `shapeId`.
*/
export function getNodesOfShape(graph: Readonly<Graph>, shapeId: ShapeId): readonly Node[] {
  return filter([...graph.nodes.values()], (node) => node.shape === shapeId);
}

/**
Returns all edges whose shape matches the given `shapeId`.
*/
export function getEdgesOfShape(graph: Readonly<Graph>, shapeId: ShapeId): readonly Edge[] {
  return filter([...graph.edges.values()], (edge) => edge.shape === shapeId);
}

/**
Returns all edges originating from the given nodeId, optionally filtered by `edgeShape`.
*/
export function getEdgesFrom(
  graph: Readonly<Graph>,
  nodeId: NodeId,
  edgeShape?: ShapeId | null | undefined,
): readonly Edge[] {
  return filter([...graph.edges.values()], (edge) => {
    if (edge.source !== nodeId) return false;
    if (edgeShape === undefined) return true;
    return edgeShape === null ? edge.shape === undefined : edge.shape === edgeShape;
  });
}

/**
Finds the inverse edge Shape for a given edge Shape.
Returns ok(Node) if an inverse is found, ok(undefined) if no inverse is defined,
and err(Error) if the edge shape node doesn't exist, isn't an edge shape, or has a broken reference.
*/
export function findInverseEdgeShape(
  graph: Readonly<Graph>,
  edgeShapeId: ShapeId,
): Result<Node | undefined, Error> {
  const edgeShapeNodeId = asNodeId(edgeShapeId);
  const edgeShapeNode = graph.nodes.get(edgeShapeNodeId);

  if (!edgeShapeNode) {
    return error(new Error(`Edge shape node not found for shape: ${edgeShapeId}`));
  }

  if (
    edgeShapeNode.shape !== SYSTEM_IDS.SHAPE ||
    edgeShapeNode.properties.get('entityKind') !== 'edge'
  ) {
    return error(
      new Error(`Node ${edgeShapeId} is not an edge shape (is ${edgeShapeNode.shape ?? 'open'})`),
    );
  }

  const inverseProperty = edgeShapeNode.properties.get('inverse');

  if (inverseProperty === undefined) {
    return ok(undefined);
  }

  if (typeof inverseProperty !== 'string') {
    return error(new Error(`Inverse property on edge shape ${edgeShapeId} must be a string`));
  }

  const inverseNodeId = asNodeId(inverseProperty);
  const inverseNode = graph.nodes.get(inverseNodeId);

  if (!inverseNode) {
    return error(
      new Error(
        `Broken reference: inverse edge shape ${inverseProperty} for ${edgeShapeId} not found`,
      ),
    );
  }

  return inverseNode.shape === SYSTEM_IDS.SHAPE &&
    inverseNode.properties.get('entityKind') === 'edge'
    ? ok(inverseNode)
    : error(
        new Error(
          `Inverse node ${inverseProperty} for ${edgeShapeId} is not an edge shape (is ${inverseNode.shape ?? 'open'})`,
        ),
      );
}
