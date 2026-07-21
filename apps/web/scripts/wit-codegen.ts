import { spawn, build } from 'bun';

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
    // 1. Generate types from WIT definitions
    await runCommand(['bunx', 'jco', 'types', './wit', '-o', './src/plugin/types']);

    // 2. Bundle guest TS using Bun.build into ESM JS
    console.log('Bundling guest TypeScript plugin...');
    const buildResult = await build({
      entrypoints: ['src/plugin/mock/guest.ts'],
      outdir: 'src/plugin/mock',
      target: 'browser',
      format: 'esm',
      external: [
        'canopy:graph/draft-session',
        'canopy:graph/plugin-manifest',
        'canopy:graph/plugin-lifecycle',
        'canopy:graph/wizard-execution',
        'canopy:graph/plugin',
      ],
    });

    if (!buildResult.success) {
      console.error(buildResult.logs);
      throw new Error('Failed to bundle guest TypeScript plugin.');
    }

    // 3. Compile the bundled JS into a WASM Component
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

    // 4. Transpile the WASM Component using custom instantiation
    await runCommand([
      'bunx',
      'jco',
      'transpile',
      'src/plugin/mock/plugin.wasm',
      '--instantiation',
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
