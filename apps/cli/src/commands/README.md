# CLI commands

## Overview

This directory defines the Effect CLI command groups (`edge`, `events`, `node`, `query`, `status`, `types`) that connect to the Canopy IPC daemon via `makeIpcClient` to inspect or mutate graph state, execute queries, tail events, and check daemon status.

## Interface

- `[edge.ts:edgeCommand]` Exported `'edge'` command with subcommands `get` (`--id`), `list` (`--type`, `--source`, `--target`, `--limit`), `create` (`--id`, `--type`, `--source`, `--target`, `--properties`), and `delete` (`--id`).
- `[events.ts:eventsCommand]` and `[events.ts:eventsTailCommand]` Exported `'events'` command with `tail` subcommand (`--graph-id`, `--from-sequence`).
- `[node.ts:nodeCommand]` Exported `'node'` command with subcommands `get` (`--id`), `list` (`--type`, `--limit`), `create` (`--id`, `--type`, `--properties`), `update` (`--id`, `--properties`), and `delete` (`--id`).
- `[query.ts:queryCommand]` Exported `'query'` command with `execute` subcommand (`--query`, `--steps`).
- `[status.ts:statusEffect]` and `[status.ts:statusCommand]` Exported Effect helper and `'status'` command checking IPC daemon connectivity and handshake status.
- `[types.ts:typesCommand]` Exported `'types'` command with subcommands `list` (`--kind: 'node' | 'edge' | 'all'`) and `get` (`--id`).

## Invariants

- All commands inherit `socketPathOption` and `jsonOption` from `../options`.
- `[edge.ts:parseProperties]` and `[node.ts:parseProperties]` Resolve empty/whitespace-only `--properties` to `{}` and fail with `Error` if non-empty input does not parse as a non-null, non-array JSON object.
- `[query.ts:parseSteps]` Resolves empty/whitespace-only `--steps` to `undefined` and fails with `Error` if non-empty input does not parse as a JSON array.
- `[types.ts:typesListCommand]` Filters type definitions using `NODE_TYPE_ID` (`'node:type:node-type'`) and `EDGE_TYPE_ID` (`'node:type:edge-type'`), defaulting `--kind` to `'all'`.
- `[events.ts:eventsTailEffect]` Fails with `Error('Socket disconnected')` if `makeIpcClient` fails; closes the client and fails with `Error('Failed to subscribe: ...')` if `client.subscribe` fails; otherwise suspends via `Effect.never`.
- `[status.ts:statusEffect]` Closes the IPC client after `client.handshake()` regardless of outcome and fails with `Error('Socket disconnected')` on connection or handshake failure.

## Side Effects

- All command handlers connect to the IPC Unix socket via `makeIpcClient`, invoke client RPCs (`getEdge`, `getEdges`, `createEdge`, `deleteEdge`, `getNode`, `getNodes`, `createNode`, `updateNodeProperties`, `deleteNode`, `executeQuery`, `subscribe`, `handshake`), call `client.close`, and write output via `Console.log`.
- `[events.ts:eventsTailEffect]` Logs incoming streamed events synchronously via `Effect.runSync(Console.log(...))`.

## Verification

- Run: `bun test`
