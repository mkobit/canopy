import * as path from 'node:path';
import { Options } from '@effect/cli';

export const socketPathOption = Options.text('socket-path').pipe(
  Options.withDefault(
    process.env.CANOPY_SOCKET_PATH ?? path.join(process.cwd(), 'tmp', 'canopy.sock'),
  ),
  Options.withDescription('Path to the Canopy IPC Unix domain socket'),
);

export const jsonOption = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Output response as JSON'),
);
