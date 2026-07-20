import { spawn } from 'bun';

async function runCommand(cmd: readonly string[]): Promise<void> {
  console.log(`Running: ${cmd.join(' ')}`);
  const proc = spawn(cmd, {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${cmd.join(' ')}`);
  }
}

async function main(): Promise<void> {
  try {
    await runCommand(['bunx', 'jco', 'types', './wit', '-o', './src/plugin/types']);

    await runCommand([
      'bunx',
      'jco',
      'componentize',
      'src/plugin/mock/guest.js',
      '--wit',
      'wit',
      '-n',
      'wizard-plugin',
      '-o',
      'src/plugin/mock/plugin.wasm',
    ]);

    await runCommand([
      'bunx',
      'jco',
      'transpile',
      'src/plugin/mock/plugin.wasm',
      '-o',
      'src/plugin/mock/transpiled',
    ]);

    console.log('WIT codegen and plugin transpilation completed successfully.');
  } catch (error) {
    console.error('Error running WIT codegen build pipeline:', error);
    process.exit(1);
  }
}

void main();
