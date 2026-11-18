import { describe, expect, it } from 'bun:test';
import { Command } from 'effect/cli';
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { rootCommand } from '../src/index';

const runCli = (arguments_: readonly string[]) =>
  Effect.runPromise(
    Command.runWith(rootCommand, { version: '0.1.0' })(arguments_).pipe(
      Effect.provide(NodeServices.layer),
    ),
  );

describe('Canopy CLI root command', () => {
  it('supports --help', async () => {
    await expect(runCli(['--help'])).resolves.toBeUndefined();
  });

  it('supports --version', async () => {
    await expect(runCli(['--version'])).resolves.toBeUndefined();
  });
});
