import type { Result, TypeId } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import { IPC_METHODS } from '@canopy/api-adapter';

export type AllowlistRejection = Readonly<{
  _tag: 'AllowlistRejection';
  message: string;
}>;

const reject = (message: string): AllowlistRejection => ({ _tag: 'AllowlistRejection', message });

// Methods relayed verbatim, with no extra per-request narrowing beyond
// membership in this set -- see design.md Decision 1 and the
// native-messaging-bridge spec's "narrowing proxy" requirement.
const RELAYED_WITHOUT_EXTRA_CHECKS: ReadonlySet<string> = new Set([
  IPC_METHODS.HANDSHAKE,
  IPC_METHODS.DRAFT_CREATE,
  IPC_METHODS.DRAFT_PREVIEW,
  IPC_METHODS.DRAFT_COMMIT,
  IPC_METHODS.DRAFT_DISCARD,
  // Read-only; needed by the extension to ensure/resolve the WebClip type
  // before staging a clip. Narrow on its own (no writes possible).
  IPC_METHODS.QUERY_GET_NODES,
]);

// Methods that are allowlisted but need request-specific narrowing beyond
// method-name membership (the clip-namespace/WebClip-type restriction).
const NAMESPACE_NARROWED_METHODS: ReadonlySet<string> = new Set([
  IPC_METHODS.MUTATION_CREATE_NODE,
  IPC_METHODS.DRAFT_APPLY,
]);

export const isAllowedMethod = (method: string): boolean =>
  RELAYED_WITHOUT_EXTRA_CHECKS.has(method) || NAMESPACE_NARROWED_METHODS.has(method);

export const needsNamespaceCheck = (method: string): boolean =>
  NAMESPACE_NARROWED_METHODS.has(method);

/**
 * Constrains a direct canopy.v1.mutation.createNode call to the ensured
 * WebClip type -- the host's only notion of "the clip namespace" at the
 * wire level is the single type id ensureWebClipType resolved, since
 * instances carry a `type` (TypeId), not a namespace, on the wire.
 */
export const checkCreateNodeParameters = (
  parameters: unknown,
  webClipTypeId: TypeId | undefined,
): Result<undefined, AllowlistRejection> => {
  if (!webClipTypeId) {
    return err(
      reject('canopy.v1.mutation.createNode requested before the WebClip type was ensured'),
    );
  }
  if (typeof parameters !== 'object' || parameters === null || !('type' in parameters)) {
    return err(reject('canopy.v1.mutation.createNode requires a type parameter'));
  }
  const { type } = parameters as Readonly<{ type: unknown }>;
  if (type !== webClipTypeId) {
    return err(
      reject('canopy.v1.mutation.createNode is restricted to the clip namespace WebClip type'),
    );
  }
  return ok(undefined);
};

type WireGraphEvent = Readonly<{ type?: unknown; nodeType?: unknown }>;

/**
 * Constrains a draft.apply request's staged events to a single NodeCreated
 * for the ensured WebClip type. Type-authoring (the namespace + NodeType +
 * default-view events) is committed internally by ensureWebClipType, never
 * relayed from the extension, so any incoming draft.apply batch is expected
 * to be exactly the clip instance -- anything else (deletes, updates, other
 * types, multi-event batches) is rejected without reaching the daemon.
 */
export const checkDraftApplyParameters = (
  parameters: unknown,
  webClipTypeId: TypeId | undefined,
): Result<undefined, AllowlistRejection> => {
  if (!webClipTypeId) {
    return err(reject('canopy.v1.draft.apply requested before the WebClip type was ensured'));
  }
  if (typeof parameters !== 'object' || parameters === null || !('events' in parameters)) {
    return err(reject('canopy.v1.draft.apply requires an events parameter'));
  }
  const { events } = parameters as Readonly<{ events: unknown }>;
  if (!Array.isArray(events) || (events as readonly unknown[]).length !== 1) {
    return err(reject('canopy.v1.draft.apply is restricted to a single staged clip event'));
  }
  const [event] = events as readonly unknown[];
  if (
    typeof event !== 'object' ||
    event === null ||
    (event as WireGraphEvent).type !== 'NodeCreated' ||
    (event as WireGraphEvent).nodeType !== webClipTypeId
  ) {
    return err(
      reject('canopy.v1.draft.apply is restricted to a NodeCreated event for the WebClip type'),
    );
  }
  return ok(undefined);
};
