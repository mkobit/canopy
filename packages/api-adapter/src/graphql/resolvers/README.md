# GraphQL resolvers

## Overview

These three files implement the GraphQL mutation, query, and subscription resolvers by delegating operations to `@canopy/graph-access`. They enforce actor delegation checks, pagination and traversal bounds, and async iterator buffering.

## Interface

- `[mutations.ts:ActorContextInput]` Interface for optional `actingId`, `actorType` (`'USER' | 'AGENT' | 'PLUGIN' | 'WORKFLOW' | 'SYSTEM'`), and `delegationToken`.
- `[mutations.ts:ValidatedActorContext]` `readonly` type with `principalId`, `actingId`, `actorType`, `approvalState` (`'DIRECT_USER' | 'APPROVED' | 'SYSTEM_PERMITTED'`), and optional `delegationId`.
- `[mutations.ts:validateActorDelegation]` `(context: GraphAccessContext, actorInput?: ActorContextInput) => Result<ValidatedActorContext, GraphAccessError>`
- `[mutations.ts:createMutationResolvers]` `(context: GraphAccessContext) => { createNode, updateNodeProperties, deleteNode, createEdge, deleteEdge }`
- `[queries.ts:createQueryResolvers]` `(context: GraphAccessContext) => { node, nodes, edges, traversal, gqlQuery, nodeTypes, nodeType, edgeTypes, edgeType, systemIds }`
- `[subscriptions.ts:EventStreamSubscriptionArgs]` `readonly` type with optional `lastSeenEventId` and `bufferCapacity`.
- `[subscriptions.ts:EventStreamSubscriptionValue]` `readonly` type `{ eventStream: EventStreamMessage }`.
- `[subscriptions.ts:createSubscriptionResolvers]` `(context: GraphAccessContext, _eventBus?: EventBus) => { eventStream: { subscribe } }`

## Invariants

- `[mutations.ts:validateActorDelegation]` Defaults `principalId` to `context.authContext?.userId ?? 'user:default'`; missing `actorInput`, missing `actorType`, or `actorType === 'USER'` yields `actingId = principalId`, `actorType = 'USER'`, `approvalState = 'DIRECT_USER'`.
- `[mutations.ts:validateActorDelegation]` For `actorType` `'AGENT'` or `'PLUGIN'`, requires a truthy `delegationToken` not equal to `'invalid'` or returns `err(UNAUTHORIZED)` with `details.code = 'AGENT_APPROVAL_REQUIRED'` and `actingId` defaulting to `'agent:unknown'`; valid tokens yield `approvalState = 'APPROVED'`, `actingId` defaulting to `'agent:authenticated'`, and `delegationId = \`delegation:${actorInput.delegationToken}\``.
- `[mutations.ts:validateActorDelegation]` For `actorType` `'WORKFLOW'` or `'SYSTEM'`, yields `approvalState = 'SYSTEM_PERMITTED'` and `actingId` defaulting to `'system:kernel'`.
- `[mutations.ts:resolveCreateNode]` All five mutation resolvers validate actor delegation before calling `executeMutation.*`, throwing `GraphQLError` with `extensions.code = 'AGENT_APPROVAL_REQUIRED'` on actor failure and `extensions = { code: result.error.code, details: result.error.details }` on mutation failure.
- `[queries.ts:createNodeQueryResolvers]` `nodes`, `edges`, and `gqlQuery` compute `offset` as `after ? decodeCursor(after) + 1 : 0`, clamp `limit` to `Math.min(first ?? 50, 100)`, and return empty connections on `!result.ok`; `node` returns `null` on `!result.ok`; `gqlQuery` ignores `arguments_.query` and queries `executeQuery.getNodes(context, {})`.
- `[queries.ts:createNodeQueryResolvers]` `traversal` defaults `maxDepth` to `5`, `maxNodes` to `500`, and `maxEdges` to `1000`, sets `truncated` when nodes or edges exceed limits, and returns `{ nodes: [], edges: [], truncated: false }` on `!result.ok`.
- `[queries.ts:createMetadataQueryResolvers]` `nodeTypes` filters `SYSTEM_IDS` keys starting with `'TYPE_'` or ending with `'_TYPE'`; `systemIds` returns `Object.values(SYSTEM_IDS)`, `Object.values(SYSTEM_EDGE_TYPES)`, and `[NAMESPACE_SYSTEM, NAMESPACE_USER, NAMESPACE_IMPORTED]`.
- `[subscriptions.ts:createSubscriptionResolvers]` Resolves `bufferCapacity` as `arguments_.bufferCapacity ?? context.limits?.maxStreamBuffer ?? 100` (`lastSeenEventId` is not passed to `createEventStreamSubscriber`); delivers events to `pendingResolve.current` when awaiting `next()`, otherwise appends to `messageQueue.current`, draining `messageQueue.current` before checking `isDone.current || subscriber.isClosed()`.

## Side Effects

- `[mutations.ts:resolveCreateNode]` Mutation resolvers invoke `executeMutation.createNode`, `updateNodeProperties`, `deleteNode`, `createEdge`, and `deleteEdge` on `context`, and throw `GraphQLError` on validation or execution errors.
- `[subscriptions.ts:createSubscriptionResolvers]` Creates a subscriber via `createEventStreamSubscriber`, registers a callback via `subscriber.subscribe`, mutates local `messageQueue`/`pendingResolve`/`isDone` state objects, and calls `unsubscribe()` and `subscriber.close()` in iterator `return()`.

## Verification

- Run: `bun test`
