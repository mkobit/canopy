import { spawn, build } from 'bun';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface PluginConfig {
  readonly name: string;
  readonly entrypoint: string;
  readonly world: string;
  readonly outDir: string;
}

interface ConfigSchema {
  readonly plugins: readonly PluginConfig[];
}

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
    // 1. Generate types from WIT definitions once
    await runCommand(['bunx', 'jco', 'types', './wit', '-o', './src/plugin/types']);

    const cwd = process.cwd();
    const configPath = resolve(cwd, 'plugins.config.json');
    console.log(`Reading plugins config from: ${configPath}`);
    const configContent = readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent) as ConfigSchema;

    for (const plugin of config.plugins) {
      console.log(`\n--- Compiling Plugin: ${plugin.name} ---`);
      const entrypointPath = resolve(cwd, plugin.entrypoint);
      const outDir = resolve(cwd, plugin.outDir);

      // Determine bundled JS name (replace .ts extension of entrypoint with .js in outDir)
      const entrypointBasename = plugin.entrypoint.split('/').pop() ?? 'guest.ts';
      const bundledJsName = entrypointBasename.replace(/\.ts$/, '.js');
      const bundledJsPath = resolve(outDir, bundledJsName);
      const wasmPath = resolve(outDir, 'plugin.wasm');
      const transpiledDir = resolve(outDir, 'transpiled');

      // 2. Bundle guest TS using Bun.build into ESM JS
      console.log(`Bundling guest TypeScript plugin ${plugin.name} into ${bundledJsPath}...`);
      const buildResult = await build({
        entrypoints: [entrypointPath],
        outdir: outDir,
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
        throw new Error(`Failed to bundle guest TypeScript plugin: ${plugin.name}`);
      }

      // 3. Compile the bundled JS into a WASM Component
      await runCommand([
        'bunx',
        'jco',
        'componentize',
        bundledJsPath,
        '--wit',
        'wit',
        '-n',
        plugin.world,
        '-o',
        wasmPath,
      ]);

      // 4. Transpile the WASM Component using custom instantiation
      await runCommand([
        'bunx',
        'jco',
        'transpile',
        wasmPath,
        '--instantiation',
        '-o',
        transpiledDir,
      ]);

      console.log(`Successfully completed compilation for ${plugin.name}.`);
    }

    console.log('\nWIT codegen and all plugin transpilation completed successfully.');
  } catch (error) {
    console.error('Error running WIT codegen build pipeline:', error);
    process.exit(1);
  }
}

void main();
