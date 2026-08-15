import { z } from 'zod';

// Wire protocol for the terminable render worker. The main thread posts an
// `execute` request; the worker may post `host-call` requests that the main
// thread answers with `host-result` (host imports are marshaled to the
// main-thread graph, capability-checked main-side — design decision 3a); the
// worker posts a final `result`. All payloads are plain, structured-clone-safe
// objects, and every inbound message is validated before use.

// Serialized `Result<string, ApiAdapterError>` across the worker boundary. The
// error carries only category + message (no non-cloneable fields).
export const serializedResultSchema = z.union([
  z.object({ ok: z.literal(true), value: z.string() }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.object({ category: z.string(), message: z.string() }).strict(),
    })
    .strict(),
]);
// Readonly-wrapped so the inferred wire types satisfy `prefer-immutable-types`
// where they appear as parameters/returns (Zod infers mutable object shapes).
export type SerializedResult = Readonly<z.infer<typeof serializedResultSchema>>;

// main → worker: run a guest.
export const executeRequestSchema = z
  .object({
    kind: z.literal('execute'),
    requestId: z.string(),
    guestId: z.string(),
    token: z.string(),
    inputJson: z.string(),
    timeoutMs: z.number().int().positive(),
  })
  .strict();
export type ExecuteRequest = Readonly<z.infer<typeof executeRequestSchema>>;

// main → worker: a host-import call result.
export const hostResultSchema = z
  .object({
    kind: z.literal('host-result'),
    callId: z.string(),
    result: serializedResultSchema,
  })
  .strict();

export const workerInboundSchema = z.union([executeRequestSchema, hostResultSchema]);

// worker → main: a host-import call to marshal to the graph.
export const hostCallSchema = z
  .object({
    kind: z.literal('host-call'),
    requestId: z.string(),
    callId: z.string(),
    group: z.enum(['queries', 'mutations', 'events']),
    method: z.string(),
    token: z.string(),
    payloadJson: z.string(),
  })
  .strict();
export type HostCall = Readonly<z.infer<typeof hostCallSchema>>;

// worker → main: final execution result.
export const executeResultSchema = z
  .object({
    kind: z.literal('result'),
    requestId: z.string(),
    result: serializedResultSchema,
  })
  .strict();
