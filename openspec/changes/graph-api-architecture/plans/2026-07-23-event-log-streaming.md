# Event Log Streaming Interface & Backpressure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real-time event log subscription broadcasting, stream flow control with backpressure and disconnect on buffer overflow, and event catch-up replay with max replay limits and gap notifications.

**Architecture:** Create `packages/api-adapter/src/event-stream-handlers.ts` exporting `createEventStreamSubscriber` and `executeReplayEventStream` functions. Streaming subscribers register with `GraphSession` event bus. Stream flow control is enforced via configurable buffer capacities (default 100 events); if buffer thresholds are exceeded, an `overflow_disconnect` message and gap notification are emitted before disconnecting the listener. Catch-up replay queries `EventLogStore` for unacknowledged events after a `lastSeenEventId`, capping replay length at `maxReplayCount` (default 1000 events) and emitting gap notifications if bounds are exceeded or events are expired.

**Tech Stack:** TypeScript (strict mode), `@canopy/graph` (`GraphSession`, `EventLogStore`, `GraphEvent`), Bun test runner.

## Global Constraints

- Strict functional programming style with immutable data structures (`readonly` modifiers on all type properties).
- Return errors as structured `Result<T, E>` / `ApiResponse<T>` instead of throwing runtime exceptions.
- Zero external transport dependencies in `@canopy/api-adapter` (transport adapters like GraphQL/Connect-Web/WASM wrap these core handlers in later tasks).
- All workspace tests must pass cleanly (`bun test`), linting must pass (`bun run lint`), and strict typechecking must pass (`bun run typecheck`).

---

### Task 1: Define Streaming and Replay Payload Types

**Files:**

- Modify: `packages/api-adapter/src/api-payloads.ts`
- Modify: `packages/api-adapter/src/index.ts`
- Modify: `packages/api-adapter/tests/api-payloads.test.ts`

**Interfaces:**

- Consumes: `@canopy/graph` (`GraphEvent`, `EventId`)
- Produces: `EventStreamMessage`, `StreamMessageKind`, `EventStreamOptions`, `ReplayRequestPayload`, `EventStreamSubscriber`

- [ ] **Step 1: Write failing test for streaming payload types**

```typescript
// packages/api-adapter/tests/api-payloads.test.ts
import { describe, expect, it } from 'bun:test';
import type {
  EventStreamMessage,
  EventStreamOptions,
  ReplayRequestPayload,
  StreamMessageKind,
} from '../src/api-payloads';

describe('Event Streaming Payload Definitions', () => {
  it('instantiates valid EventStreamMessage structures', () => {
    const msg: EventStreamMessage = {
      kind: 'event',
      event: {
        id: 'evt-1' as any,
        type: 'NodeCreated',
        graphId: 'graph-1',
        sequence: 1,
        timestamp: 1000,
        nodeId: 'node-1' as any,
        nodeType: 'Markdown',
        properties: {},
      },
    };
    expect(msg.kind).toBe('event');
    expect(msg.event?.id).toBe('evt-1');
  });

  it('instantiates valid gap and disconnect message structures', () => {
    const gapMsg: EventStreamMessage = {
      kind: 'gap',
      gapCount: 15,
      lastSeenEventId: 'evt-50',
      reason: 'Replay window exceeded max limit',
    };
    const overflowMsg: EventStreamMessage = {
      kind: 'overflow_disconnect',
      gapCount: 100,
      reason: 'Subscriber buffer overflowed',
    };
    expect(gapMsg.kind).toBe('gap');
    expect(gapMsg.gapCount).toBe(15);
    expect(overflowMsg.kind).toBe('overflow_disconnect');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/api-payloads.test.ts`
Expected: FAIL with missing exports `EventStreamMessage`, `EventStreamOptions`, etc.

- [ ] **Step 3: Add streaming payload types to api-payloads.ts and re-export in index.ts**

```typescript
// Add to packages/api-adapter/src/api-payloads.ts
import type { EventId, GraphEvent } from '@canopy/graph';

export type StreamMessageKind = 'event' | 'gap' | 'overflow_disconnect' | 'end';

export interface EventStreamMessage {
  readonly kind: StreamMessageKind;
  readonly event?: GraphEvent;
  readonly events?: readonly GraphEvent[];
  readonly gapCount?: number;
  readonly lastSeenEventId?: EventId | string;
  readonly reason?: string;
}

export interface EventStreamOptions {
  readonly bufferCapacity?: number;
  readonly maxReplayCount?: number;
}

export interface ReplayRequestPayload {
  readonly tenantId: string;
  readonly graphId: string;
  readonly lastSeenEventId: string;
  readonly maxReplayCount?: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/api-payloads.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add packages/api-adapter/src/api-payloads.ts packages/api-adapter/src/index.ts packages/api-adapter/tests/api-payloads.test.ts
git commit -m "feat(api-adapter): define event streaming and catch-up replay payload types"
```

---

### Task 2: Implement Real-Time Event Subscription Streaming Handler with Backpressure

**Files:**

- Create: `packages/api-adapter/src/event-stream-handlers.ts`
- Modify: `packages/api-adapter/src/index.ts`
- Create: `packages/api-adapter/tests/event-stream-handlers.test.ts`

**Interfaces:**

- Consumes: `ApiAdapterContext`, `EventStreamMessage`, `EventStreamOptions`
- Produces: `createEventStreamSubscriber(context, options)` returning subscription handle with `subscribe(listener)`, `getBufferCount()`, `close()`

- [ ] **Step 1: Write failing test for event subscription streaming and backpressure**

```typescript
// packages/api-adapter/tests/event-stream-handlers.test.ts
import { describe, expect, it } from 'bun:test';
import { createEventStreamSubscriber } from '../src/event-stream-handlers';
import type { EventStreamMessage } from '../src/api-payloads';
import type { ApiAdapterContext } from '../src/api-context';

describe('Real-Time Event Stream Subscriber', () => {
  it('broadcasts live committed events to active stream listeners', async () => {
    // Setup test session and context
    // Execute node creation mutation
    // Assert listener receives 'event' message with NodeCreated event
  });

  it('enforces buffer capacity backpressure and disconnects subscriber on overflow', async () => {
    // Create subscriber with bufferCapacity = 2
    // Emit 5 events rapidly without consuming
    // Assert subscriber receives overflow_disconnect message and listener is detached
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/event-stream-handlers.test.ts`
Expected: FAIL with module `../src/event-stream-handlers` not found

- [ ] **Step 3: Implement createEventStreamSubscriber in event-stream-handlers.ts**

```typescript
// packages/api-adapter/src/event-stream-handlers.ts
import type { GraphEvent } from '@canopy/graph';
import type { ApiAdapterContext } from './api-context';
import type { EventStreamMessage, EventStreamOptions } from './api-payloads';

export interface EventStreamSubscription {
  readonly subscribe: (listener: (message: EventStreamMessage) => void) => () => void;
  readonly getBufferCount: () => number;
  readonly isClosed: () => boolean;
  readonly close: () => void;
}

export function createEventStreamSubscriber(
  context: ApiAdapterContext,
  options: EventStreamOptions = {},
): EventStreamSubscription {
  const bufferCapacity = options.bufferCapacity ?? 100;
  let listeners = new Set<(message: EventStreamMessage) => void>();
  let buffer: EventStreamMessage[] = [];
  let closed = false;

  const notifyListeners = (message: EventStreamMessage): void => {
    for (const listener of listeners) {
      listener(message);
    }
  };

  const handleGraphEvents = (_graph: unknown, events: readonly GraphEvent[]): void => {
    if (closed) return;

    for (const event of events) {
      if (buffer.length >= bufferCapacity) {
        // Overflow detected: emit gap & overflow_disconnect, then close
        const overflowMessage: EventStreamMessage = {
          kind: 'overflow_disconnect',
          gapCount: buffer.length + 1,
          reason: `Subscriber buffer capacity of ${bufferCapacity} exceeded`,
        };
        notifyListeners(overflowMessage);
        close();
        return;
      }

      const message: EventStreamMessage = {
        kind: 'event',
        event,
      };
      buffer.push(message);
      notifyListeners(message);
    }
  };

  const unsubscribeSession = context.session.subscribe(handleGraphEvents);

  const close = (): void => {
    if (closed) return;
    closed = true;
    unsubscribeSession();
    notifyListeners({ kind: 'end' });
    listeners.clear();
    buffer = [];
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getBufferCount: () => buffer.length,
    isClosed: () => closed,
    close,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/event-stream-handlers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add packages/api-adapter/src/event-stream-handlers.ts packages/api-adapter/src/index.ts packages/api-adapter/tests/event-stream-handlers.test.ts
git commit -m "feat(api-adapter): implement real-time event streaming subscriber with backpressure flow control"
```

---

### Task 3: Implement Event Catch-Up Replay Handler with Max Replay Bounds and Gap Notifications

**Files:**

- Modify: `packages/api-adapter/src/event-stream-handlers.ts`
- Modify: `packages/api-adapter/tests/event-stream-handlers.test.ts`

**Interfaces:**

- Consumes: `ApiAdapterContext`, `ReplayRequestPayload`, `EventLogStore`
- Produces: `executeReplayEventStream(context, payload)` returning `Promise<ApiResponse<readonly EventStreamMessage[]>>`

- [ ] **Step 1: Write failing test for event catch-up replay and max replay bounds**

```typescript
// Add to packages/api-adapter/tests/event-stream-handlers.test.ts
describe('Event Catch-Up Replay Handler', () => {
  it('replays unacknowledged events from EventLogStore after lastSeenEventId', async () => {
    // Append 3 events to eventLogStore
    // Execute replay with lastSeenEventId = event[0].id
    // Assert returns remaining 2 events with kind = 'event'
  });

  it('emits gap notification when requested replay count exceeds maxReplayCount limit', async () => {
    // Append 15 events to eventLogStore
    // Execute replay with maxReplayCount = 5
    // Assert returns gap message indicating client should fetch full graph snapshot
  });

  it('rejects replay request if tenant boundary validation fails', async () => {
    // Execute replay with mismatched tenant ID
    // Assert returns FORBIDDEN error response
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/event-stream-handlers.test.ts`
Expected: FAIL with `executeReplayEventStream` not defined

- [ ] **Step 3: Implement executeReplayEventStream in event-stream-handlers.ts**

```typescript
// Add to packages/api-adapter/src/event-stream-handlers.ts
import type { ApiResponse } from './api-context';
import type { ReplayRequestPayload } from './api-payloads';
import { createApiError, createApiSuccess } from './api-context';
import { ApiAdapterErrorCode } from './result-errors';

export async function executeReplayEventStream(
  context: ApiAdapterContext,
  payload: ReplayRequestPayload,
): Promise<ApiResponse<readonly EventStreamMessage[]>> {
  if (context.tenantId !== payload.tenantId) {
    return createApiError(
      ApiAdapterErrorCode.FORBIDDEN,
      `Tenant boundary mismatch: payload tenant '${payload.tenantId}' does not match context tenant '${context.tenantId}'`,
    );
  }

  const maxReplay = payload.maxReplayCount ?? 1000;
  const eventsResult = await context.eventLogStore.getEvents(payload.graphId, {
    after: payload.lastSeenEventId as any,
  });

  if (!eventsResult.ok) {
    return createApiError(
      ApiAdapterErrorCode.INTERNAL_ERROR,
      `Failed to query event log store for catch-up replay: ${eventsResult.error.message}`,
    );
  }

  const unacknowledgedEvents = eventsResult.value;

  if (unacknowledgedEvents.length > maxReplay) {
    const gapMessage: EventStreamMessage = {
      kind: 'gap',
      gapCount: unacknowledgedEvents.length,
      lastSeenEventId: payload.lastSeenEventId,
      reason: `Unacknowledged event count (${unacknowledgedEvents.length}) exceeds maximum replay threshold of ${maxReplay}. Full graph snapshot required.`,
    };
    return createApiSuccess([gapMessage]);
  }

  const streamMessages: readonly EventStreamMessage[] = unacknowledgedEvents.map((event) => ({
    kind: 'event',
    event,
  }));

  return createApiSuccess(streamMessages);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/event-stream-handlers.test.ts`
Expected: PASS

- [ ] **Step 5: Run quality gates across workspace**

Run: `bun run build && bun run lint && bun run typecheck && bun test`
Expected: All build steps, linters, typechecks, and 493+ tests pass cleanly.

- [ ] **Step 6: Commit changes**

```bash
git add packages/api-adapter/src/event-stream-handlers.ts packages/api-adapter/tests/event-stream-handlers.test.ts
git commit -m "feat(api-adapter): implement event catch-up replay handler with max replay limits and gap notifications"
```
