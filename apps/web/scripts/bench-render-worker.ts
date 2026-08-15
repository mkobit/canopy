/**
 * Bench worker (canopy-ay6). Runs the fixture interactive guest through the real
 * `executeSandboxedGuestPlugin` so the render-worker transport cost (worker
 * construction + per-render round-trip) can be measured without the 12.5 MB WASM
 * component. Driven by `bench-wasm-render.ts`; not wired into CI.
 */
import { createApiAdapterContext, executeSandboxedGuestPlugin } from '@canopy/api-adapter';
import { asGraphId, createGraph } from '@canopy/graph';
import { WORKER_GUESTS } from '../src/plugin/runtime/worker-guests';

declare const self: Worker;

const graphResult = createGraph(asGraphId('bench-worker'), 'bench-worker');
const context = graphResult.ok ? createApiAdapterContext({ graph: graphResult.value }) : undefined;

self.onmessage = async (event: MessageEvent<{ id: number; inputJson: string }>): Promise<void> => {
  const guest = WORKER_GUESTS.get('fixture:interactive');
  if (guest === undefined || context === undefined) {
    self.postMessage({ id: event.data.id, ok: false });
    return;
  }
  const result = await executeSandboxedGuestPlugin(
    context,
    'render:interactive',
    event.data.inputJson,
    guest,
  );
  self.postMessage({ id: event.data.id, ok: result.ok });
};
