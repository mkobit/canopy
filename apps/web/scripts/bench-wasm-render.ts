/**
 * Non-gating benchmark for per-block WASM Markdown render cost (canopy-586).
 *
 * The Tier-1 render path runs a WebAssembly component per Markdown block. This
 * script measures that cost with real wall-clock numbers so the per-block
 * overhead is measured, not assumed (design.md adversarial review): one-time
 * component instantiation, then repeated `render` calls across blocks of varying
 * size. It runs the real transpiled component (like the browser path) via the
 * preview2 WASI shim; a benign `process.binding("tcp_wrap")` warning from the
 * shim's socket init is expected under Bun and does not affect the numbers.
 *
 * Not wired into `bun test` or CI. Run manually:
 *   bun run apps/web/scripts/bench-wasm-render.ts
 * Requires the codegen pipeline to have produced the transpiled artifact:
 *   (cd apps/web && bun run codegen:wit)
 */
// The preview2 shim's socket worker emits a `tcp_wrap` error under Bun that is
// unrelated to the render path (no network is used). Swallow only that error so
// the benchmark can run; anything else still propagates.
process.on('uncaughtException', (error: unknown) => {
  if (error instanceof Error && error.message.includes('tcp_wrap')) {
    return;
  }
  throw error;
});

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import {
  instantiate,
  type ImportObject,
  type Root,
} from '../src/plugin/markdown/transpiled/plugin.js';

const transpiledDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/plugin/markdown/transpiled',
);

const getCoreModule = async (name: string): Promise<WebAssembly.Module> =>
  WebAssembly.compile(await readFile(resolve(transpiledDir, name)));

const percentile = (sorted: readonly number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

const makeMarkdown = (paragraphs: number): string =>
  Array.from(
    { length: paragraphs },
    (_unused, index) =>
      `## Section ${index}\n\nA **bold** and *italic* line with \`code\` and a [link](https://example.com).\n\n- item one\n- item two\n- item three\n`,
  ).join('\n');

const measure = (root: Root, markdown: string, iterations: number): readonly number[] => {
  const propertiesJson = JSON.stringify({ content: markdown });
  const timings: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    root.contentRendering.render(propertiesJson);
    timings.push(performance.now() - start);
  }
  return timings.toSorted((a, b) => a - b);
};

const main = async (): Promise<void> => {
  const imports = {
    // Disable network so the shim does not spin up its socket worker (which
    // emits a benign but noisy `tcp_wrap` error under Bun).
    ...new WASIShim({ sandbox: { enableNetwork: false } }).getImportObject(),
    'canopy:graph/plugin-manifest': {},
  } as unknown as ImportObject;

  const instantiateStart = performance.now();
  const root = await instantiate(getCoreModule, imports);
  const instantiateMs = performance.now() - instantiateStart;

  console.log(`\nWASM Markdown render benchmark`);
  console.log(`one-time instantiation: ${instantiateMs.toFixed(1)} ms\n`);
  console.log(`blocks  iters   median(ms)  p95(ms)   mean(ms)   renders/s`);

  const iterations = 500;
  for (const paragraphs of [1, 5, 20, 100]) {
    const sorted = measure(root, makeMarkdown(paragraphs), iterations);
    const median = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const perSecond = Math.round(1000 / mean);
    console.log(
      `${String(paragraphs).padStart(5)}  ${String(iterations).padStart(5)}   ${median
        .toFixed(3)
        .padStart(9)}  ${p95.toFixed(3).padStart(7)}  ${mean.toFixed(3).padStart(8)}  ${String(
        perSecond,
      ).padStart(9)}`,
    );
  }
  console.log('');
};

void main();
