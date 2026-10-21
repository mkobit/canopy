import * as path from 'node:path';
import { Flag } from 'effect/cli';

export const socketPathOption = Flag.String('socket-path').pipe(
  Flag.withDefault(
    process.env.CANOPY_SOCKET_PATH ?? path.join(process.cwd(), 'tmp', 'canopy.sock'),
  ),
  Flag.withDescription('Path to the Canopy IPC Unix domain socket'),
);

export const jsonOption = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Output response as JSON'),
);
