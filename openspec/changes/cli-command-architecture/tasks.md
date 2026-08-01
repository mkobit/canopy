## 1. `canopy status` command implementation

- [x] 1.1 Create `apps/cli/src/commands/status.ts` implementing `status` command and `daemon status` subcommand executing `canopy.v1.handshake` and printing `gh auth status`-style output or JSON (`--json`)
- [x] 1.2 Deprecate standalone `handshakeCommand` in favor of `statusCommand`
- [x] 1.3 Add unit and integration tests in `apps/cli/tests/status-command.test.ts` verifying connected and disconnected socket behavior

## 2. `canopy events` command implementation

- [x] 2.1 Create `apps/cli/src/commands/events.ts` implementing `events tail` subcommand streaming live event notifications over IPC socket
- [x] 2.2 Implement SIGINT signal traps for clean socket closure on interruption
- [x] 2.3 Add tests in `apps/cli/tests/events-command.test.ts` verifying event streaming and option flags (`--json`, `--graph-id`, `--from-sequence`)

## 3. Schema types & query subcommands

- [ ] 3.1 Create `apps/cli/src/commands/types.ts` implementing `types list` and `types get` subcommands
- [ ] 3.2 Create `apps/cli/src/commands/query.ts` implementing `query execute` subcommand
- [ ] 3.3 Add tests in `apps/cli/tests/types-and-query-commands.test.ts` for schema types and query execution over IPC

## 4. Root CLI integration & quality gates

- [x] 4.1 Update `apps/cli/src/index.ts` to expose `node`, `edge`, `types`, `query`, `events`, `status`, and `daemon` root subcommands
- [x] 4.2 Run full quality gate (`bun run build && bun run lint && bun run typecheck && bun test`)
