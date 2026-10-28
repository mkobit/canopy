import process from 'node:process';
import { runClipHost } from '../src/index';

runClipHost();
// Registered after the synchronous product listener: acknowledges consumption,
// independently of OS write/data-event boundaries, on test-only IPC.
process.stdin.on('data', (chunk: Buffer) => process.send?.({ consumed: chunk.length }));
process.send?.({ ready: true });
