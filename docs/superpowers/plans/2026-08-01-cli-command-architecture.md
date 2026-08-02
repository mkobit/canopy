# CLI Command Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement domain-aligned CLI subcommands (`node`, `edge`, `types`, `query`, `events`, `status`) in `apps/cli` reflecting Canopy's core data model.

**Architecture:** Effect CLI (`@effect/cli`) subcommands connecting to `@canopy/api-adapter` over Unix domain socket IPC client (`makeIpcClient`).

**Tech Stack:** TypeScript, Effect TS (`@effect/cli`, `@effect/platform-node`), `@canopy/api-adapter`, Bun Test.

## Global Constraints

- Sentence case for headings, commits, PR titles, UI labels.
- Codify tools, commands, and syntax with target output markup.
- No `any` or `Record<string, unknown>` without narrowing.
- Errors are returned as Effect errors or `Result<T, E>`, never unhandled throws.

---

### Task 1: `canopy status` Command Implementation

**Files:**
- Create: `apps/cli/src/commands/status.ts`
- Create: `apps/cli/tests/status-command.test.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/commands/handshake.ts`

**Interfaces:**
- Consumes: `makeIpcClient(socketPath).handshake()` from `apps/cli/src/ipc/ipc-client.ts`
- Produces: `statusCommand` exported from `apps/cli/src/commands/status.ts`

- [ ] **Step 1: Write failing status command test**

Create `apps/cli/tests/status-command.test.ts`:
```typescript
import { describe, expect, test } from 'bun:test';
import { statusCommand } from '../src/commands/status';

describe('statusCommand', () => {
  test('exports valid Effect CLI status command', () => {
    expect(statusCommand).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/cli/tests/status-command.test.ts`
Expected: FAIL (cannot find module `../src/commands/status`)

- [ ] **Step 3: Implement `apps/cli/src/commands/status.ts`**

```typescript
import { Command } from '@effect/cli';
import { Console, Effect } from 'effect';
import { makeIpcClient } from '../ipc/ipc-client';
import { jsonOption, socketPathOption } from '../options';

export const statusEffect = (socketPath: string, json: boolean) =>
  Effect.gen(function* () {
    const clientResult = yield* Effect.either(makeIpcClient(socketPath));
    if (clientResult._tag === 'Left') {
      if (json) {
        yield* Console.log(
          JSON.stringify({ connected: false, socketPath, error: clientResult.left.message }, undefined, 2),
        );
      } else {
        yield* Console.log(`Canopy IPC Daemon Status`);
        yield* Console.log(`  x Socket disconnected (${socketPath} - ${clientResult.left.message})`);
      }
      return yield* Effect.fail(new Error(`Socket disconnected`));
    }

    const client = clientResult.right;
    const handshakeResult = yield* Effect.either(client.handshake());
    yield* client.close();

    if (handshakeResult._tag === 'Left') {
      if (json) {
        yield* Console.log(
          JSON.stringify({ connected: false, socketPath, error: handshakeResult.left.message }, undefined, 2),
        );
      } else {
        yield* Console.log(`Canopy IPC Daemon Status`);
        yield* Console.log(`  x Socket error (${socketPath} - ${handshakeResult.left.message})`);
      }
      return yield* Effect.fail(new Error(`Socket error`));
    }

    const res = handshakeResult.right;
    if (json) {
      yield* Console.log(
        JSON.stringify(
          {
            connected: true,
            socketPath,
            apiVersion: res.apiVersion,
            serverVersion: res.serverVersion,
            capabilities: res.capabilities,
            activeSession: 'ready',
          },
          undefined,
          2,
        ),
      );
    } else {
      yield* Console.log(`Canopy IPC Daemon Status`);
      yield* Console.log(`  ✓ Socket connected (${socketPath})`);
      yield* Console.log(`  ✓ API version: ${res.apiVersion}`);
      yield* Console.log(`  ✓ Server version: ${res.serverVersion}`);
      yield* Console.log(`  ✓ Capabilities: ${res.capabilities.join(', ')}`);
      yield* Console.log(`  ✓ Active session: Ready`);
    }
  });

export const statusCommand = Command.make(
  'status',
  {
    socketPath: socketPathOption,
    json: jsonOption,
  },
  ({ socketPath, json }) => statusEffect(socketPath, json),
).pipe(Command.withDescription('Inspect Canopy IPC daemon connectivity and status'));

export const daemonCommand = Command.make('daemon').pipe(
  Command.withSubcommands([statusCommand]),
  Command.withDescription('Daemon administration commands'),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/cli/tests/status-command.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/status.ts apps/cli/tests/status-command.test.ts
git commit -m "feat(cli): implement canopy status and canopy daemon status commands"
```

---

### Task 2: `canopy events` Command Implementation

**Files:**
- Create: `apps/cli/src/commands/events.ts`
- Create: `apps/cli/tests/events-command.test.ts`
- Modify: `apps/cli/src/index.ts`

**Interfaces:**
- Consumes: `client.subscribe()` from `apps/cli/src/ipc/ipc-client.ts`
- Produces: `eventsCommand` exported from `apps/cli/src/commands/events.ts`

- [ ] **Step 1: Write failing events command test**

Create `apps/cli/tests/events-command.test.ts`:
```typescript
import { describe, expect, test } from 'bun:test';
import { eventsCommand } from '../src/commands/events';

describe('eventsCommand', () => {
  test('exports valid Effect CLI events command', () => {
    expect(eventsCommand).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/cli/tests/events-command.test.ts`
Expected: FAIL (cannot find module `../src/commands/events`)

- [ ] **Step 3: Implement `apps/cli/src/commands/events.ts`**

```typescript
import { Command, Options } from '@effect/cli';
import { Console, Effect } from 'effect';
import { makeIpcClient } from '../ipc/ipc-client';
import { jsonOption, socketPathOption } from '../options';

const eventsTailCommand = Command.make(
  'tail',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    graphId: Options.optional(Options.text('graph-id')).pipe(
      Options.withDescription('Filter event stream by graph ID'),
    ),
    fromSequence: Options.optional(Options.integer('from-sequence')).pipe(
      Options.withDescription('Start streaming from sequence number'),
    ),
  },
  ({ socketPath, json, graphId, fromSequence }) =>
    Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);

      yield* client.subscribe(
        {
          ...(graphId._tag === 'Some' && { graphId: graphId.value }),
          ...(fromSequence._tag === 'Some' && { fromSequence: fromSequence.value }),
        },
        (event) => {
          if (json) {
            void Console.log(JSON.stringify(event)).pipe(Effect.runSync);
          } else {
            void Console.log(`[event] ${JSON.stringify(event)}`).pipe(Effect.runSync);
          }
        },
      );

      yield* Console.log('Subscribed to event log stream. Press Ctrl+C to stop.');

      // Wait indefinitely until interrupted
      yield* Effect.never;
    }),
).pipe(Command.withDescription('Stream live graph events from Canopy IPC server'));

export const eventsCommand = Command.make('events').pipe(
  Command.withSubcommands([eventsTailCommand]),
  Command.withDescription('Canopy graph event log operations'),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/cli/tests/events-command.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/events.ts apps/cli/tests/events-command.test.ts
git commit -m "feat(cli): implement canopy events tail command for live event streaming"
```

---

### Task 3: Root Command Integration & Cleanup

**Files:**
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/commands/handshake.ts`

- [ ] **Step 1: Deprecate `handshake.ts` and re-export `statusCommand`**

Update `apps/cli/src/commands/handshake.ts`:
```typescript
import { statusCommand } from './status';

export const handshakeCommand = statusCommand;
```

- [ ] **Step 2: Update `apps/cli/src/index.ts`**

Update `apps/cli/src/index.ts`:
```typescript
import { Command } from '@effect/cli';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import { Effect } from 'effect';
import { edgeCommand } from './commands/edge';
import { eventsCommand } from './commands/events';
import { nodeCommand } from './commands/node';
import { daemonCommand, statusCommand } from './commands/status';

export const rootCommand = Command.make('canopy').pipe(
  Command.withSubcommands([statusCommand, daemonCommand, nodeCommand, edgeCommand, eventsCommand]),
);

export const run = Command.run(rootCommand, {
  name: 'Canopy CLI',
  version: '0.1.0',
});

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  run(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
}
```

- [ ] **Step 3: Run full quality gate**

Run: `bun run build && bun run lint && bun run typecheck && bun test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/index.ts apps/cli/src/commands/handshake.ts
git commit -m "feat(cli): integrate domain subcommands (status, daemon, node, edge, events)"
```
