import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

interface PluginManifest {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly capabilities: readonly string[];
  readonly menuItems: readonly unknown[];
  readonly commands: readonly unknown[];
}

interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly properties: {
    readonly wasm_binary: string;
    readonly manifest: string;
    readonly version: string;
  };
  readonly metadata: {
    readonly created: string;
    readonly modified: string;
    readonly modifiedBy: string;
  };
}

interface PluginConfig {
  readonly name: string;
  readonly entrypoint: string;
  readonly world: string;
  readonly outDir: string;
}

interface ConfigSchema {
  readonly plugins: readonly PluginConfig[];
}

// Extract manifest from guest.ts using regex and Function evaluation
function extractManifest(filePath: string): PluginManifest {
  const content = readFileSync(filePath, 'utf8');
  // Look for getManifest() { return { ... } } or similar
  const match = content.match(/getManifest\(\)\s*\{\s*return\s*([\s\S]*?);\s*\n\s*\}/);
  if (!match) {
    throw new Error(`Failed to find getManifest return block in ${filePath}`);
  }
  const manifestObjStr = match[1];
  // evaluate it safely to get the JS object
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const manifest = new Function(`return ${manifestObjStr}`)() as PluginManifest;
  return manifest;
}

function main(): void {
  try {
    const cwd = process.cwd();
    const configPath = resolve(cwd, 'plugins.config.json');
    console.log(`Reading plugins config for packaging from: ${configPath}`);
    const configContent = readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent) as ConfigSchema;

    for (const plugin of config.plugins) {
      console.log(`\n--- Packaging Plugin: ${plugin.name} ---`);
      const outDir = resolve(cwd, plugin.outDir);
      const wasmPath = resolve(outDir, 'plugin.wasm');
      const guestPath = resolve(cwd, plugin.entrypoint);
      const outputPath = resolve(outDir, 'plugin-node.json');

      console.log(`Reading WASM binary from: ${wasmPath}`);
      const wasmBinary = readFileSync(wasmPath);

      console.log('Compressing WASM binary using Brotli...');
      const compressed = brotliCompressSync(wasmBinary);
      const wasmBase64 = compressed.toString('base64');
      console.log(
        `Original size: ${wasmBinary.length} bytes, Brotli compressed: ${compressed.length} bytes`,
      );

      console.log(`Extracting manifest from: ${guestPath}`);
      const manifest = extractManifest(guestPath);
      const manifestJson = JSON.stringify(manifest);

      // Slugify the manifest name to create a stable node ID
      const nameSlug = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const nodeId = `system:node:plugin-${nameSlug}`;

      const timestamp = new Date().toISOString();

      const node: GraphNode = {
        id: nodeId,
        type: 'system:nodetype:plugin',
        properties: {
          wasm_binary: wasmBase64,
          manifest: manifestJson,
          version: manifest.version,
        },
        metadata: {
          created: timestamp,
          modified: timestamp,
          modifiedBy: '00000000-0000-0000-0000-000000000000',
        },
      };

      console.log(`Writing graph-ready plugin node JSON to: ${outputPath}`);
      writeFileSync(outputPath, JSON.stringify(node, null, 2), 'utf8');
      console.log(`Plugin ${plugin.name} packaging completed successfully.`);
    }
  } catch (error) {
    console.error('Error packaging plugin:', error);
    process.exit(1);
  }
}

main();
