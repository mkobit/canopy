import type { GraphEvent, NodeCreated, Result, TypeId } from '@canopy/graph';
import {
  SYSTEM_IDS,
  asGraphId,
  asTypeId,
  createDeviceId,
  createGraph,
  createNamespace,
  createNodeType,
  err,
  ok,
} from '@canopy/graph';
import type {
  ApiNodePayload,
  DraftApplyParamsInput,
  IpcClient,
  IpcClientError,
} from '@canopy/api-adapter';
import { Effect } from 'effect';

export const CLIP_NAMESPACE = 'clip';
export const WEBCLIP_TYPE_NAME = 'WebClip';

export type EnsureWebClipTypeError =
  IpcClientError | Readonly<{ _tag: 'EnsureWebClipTypeError'; message: string }>;

const ensureError = (message: string): EnsureWebClipTypeError => ({
  _tag: 'EnsureWebClipTypeError',
  message,
});

const toWireProperties = (
  properties: ReadonlyMap<string, unknown>,
): Readonly<Record<string, unknown>> => Object.fromEntries(properties);

type WireGraphEvent = DraftApplyParamsInput['events'][number];

/**
 * Converts a kernel-op-produced GraphEvent (Map-typed `properties`/`changes`,
 * matching the in-process Graph/Node representation) into the plain-object
 * shape a draft.apply client must send over JSON-RPC -- native JSON.stringify
 * drops Map contents silently. Mirrors the wire shape documented by
 * packages/api-adapter/tests/draft-flow.test.ts's `nodeCreatedEvent` helper.
 * Exhaustive over GraphEvent even though createNamespace/createNodeType only
 * ever emit NodeCreated/EdgeCreated (see generateDefaultView in
 * packages/graph/src/ops/type-authoring.ts) -- keeps this reusable without
 * relying on that as a hidden assumption.
 */
export const toWireEvent = (event: GraphEvent): Readonly<WireGraphEvent> => {
  switch (event.type) {
    case 'NodeCreated':
    case 'EdgeCreated': {
      return { ...event, properties: toWireProperties(event.properties) };
    }
    case 'NodePropertiesUpdated':
    case 'EdgePropertiesUpdated': {
      return { ...event, changes: toWireProperties(event.changes) };
    }
    case 'NodeDeleted':
    case 'EdgeDeleted':
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return { ...event };
    }
    default: {
      return event satisfies never;
    }
  }
};

const findExistingWebClipType = (nodes: readonly ApiNodePayload[]): ApiNodePayload | undefined =>
  nodes.find(
    (node) =>
      node.properties.name === WEBCLIP_TYPE_NAME && node.properties.namespace === CLIP_NAMESPACE,
  );

// design.md describes these as PropertyValueKind 'string' -- the kernel's
// actual PROPERTY_VALUE_KINDS (packages/graph/src/properties.ts) has no
// 'string' kind; the plain-text kind is named 'text'. Using the real kind.
const WEBCLIP_PROPERTIES = [
  { kind: 'inline' as const, name: 'title', valueKind: 'text', required: true },
  { kind: 'inline' as const, name: 'sourceUrl', valueKind: 'text', required: true },
  { kind: 'inline' as const, name: 'content', valueKind: 'text', required: true },
  { kind: 'inline' as const, name: 'capturedAt', valueKind: 'text', required: true },
];

type SynthesizedTypeAuthoring = Readonly<{ events: readonly GraphEvent[]; typeId: TypeId }>;

/**
 * Runs the existing createNamespace/createNodeType kernel ops against a
 * throwaway, freshly bootstrapped local Graph purely to derive well-formed
 * events -- the host has no local copy of the real remote graph, but the
 * caller has already confirmed (via a query.getNodes read) that `clip`/
 * `WebClip` don't exist there yet, so validating against a fresh graph (which
 * also lacks them) produces the same result the real graph would.
 */
const synthesizeTypeAuthoringEvents = (): Result<
  SynthesizedTypeAuthoring,
  EnsureWebClipTypeError
> => {
  const graphResult = createGraph(asGraphId('clip-host-ensure-type'), 'clip-host-ensure-type');
  if (!graphResult.ok) return err(ensureError(graphResult.error.message));

  // DeviceIdSchema requires a UUID on the wire (see schemas.ts); a fixed
  // human-readable id like 'clip-host' would fail draft.apply validation.
  const deviceId = createDeviceId();
  const namespaceResult = createNamespace(
    graphResult.value,
    { name: CLIP_NAMESPACE, kind: 'user' },
    { deviceId },
  );
  if (!namespaceResult.ok) return err(ensureError(namespaceResult.error.message));

  const typeResult = createNodeType(
    namespaceResult.value.graph,
    { name: WEBCLIP_TYPE_NAME, namespace: CLIP_NAMESPACE, properties: WEBCLIP_PROPERTIES },
    { deviceId },
  );
  if (!typeResult.ok) return err(ensureError(typeResult.error.message));

  const typeCreatedEvent = typeResult.value.events.find(
    (event): event is NodeCreated =>
      event.type === 'NodeCreated' && event.nodeType === SYSTEM_IDS.NODE_TYPE,
  );
  if (!typeCreatedEvent) {
    return err(ensureError('createNodeType did not emit a NodeCreated event for the type node'));
  }

  return ok({
    events: [...namespaceResult.value.events, ...typeResult.value.events],
    typeId: asTypeId(typeCreatedEvent.id),
  });
};

export type EnsureWebClipTypeResult = Readonly<{ typeId: TypeId; created: boolean }>;

/**
 * Idempotently ensures the `clip` namespace and `WebClip` NodeType exist,
 * authoring them (namespace + type + default-view artifacts) through a
 * self-contained draft.create/apply/commit cycle when absent. This is
 * infrastructure setup, not a user-visible clip, so it commits without a
 * preview/confirm step -- the same way kernel bootstrap runs unconfirmed.
 *
 * Known limitation: two concurrent first-ever ensure calls can both observe
 * "absent" and both attempt to author the type; the second commit either
 * fails on concurrent-modification (surfaced to the caller) or, since
 * name-uniqueness is enforced by the createNamespace/createNodeType ops
 * layer rather than by event projection, could in principle create a second
 * same-named clip/WebClip pair. Not solved here -- low severity (confined to
 * the clip namespace's own metadata) and not exercised by the sequential
 * idempotency scenario this ships against.
 */
export const ensureWebClipType = (
  client: IpcClient,
): Effect.Effect<EnsureWebClipTypeResult, EnsureWebClipTypeError> =>
  Effect.gen(function* () {
    const existingNodes = yield* client.getNodes({ type: SYSTEM_IDS.NODE_TYPE });
    const existing = findExistingWebClipType(existingNodes);
    if (existing) {
      return { typeId: asTypeId(existing.id), created: false };
    }

    const synthesized = synthesizeTypeAuthoringEvents();
    if (!synthesized.ok) return yield* Effect.fail(synthesized.error);

    const draft = yield* client.draftCreate();
    const applyResult = yield* client.draftApply({
      draftId: draft.draftId,
      events: synthesized.value.events.map(toWireEvent),
    });
    if (applyResult.staged !== synthesized.value.events.length) {
      return yield* Effect.fail(
        ensureError(
          `draft.apply staged ${applyResult.staged} events, expected ${synthesized.value.events.length}`,
        ),
      );
    }

    yield* client.draftCommit({
      draftId: draft.draftId,
      expectedParentRevision: draft.parentRevision,
    });

    return { typeId: synthesized.value.typeId, created: true };
  });
