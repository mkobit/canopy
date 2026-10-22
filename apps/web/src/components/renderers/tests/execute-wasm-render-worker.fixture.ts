import { asGraphId, createGraph, unwrap } from '@canopy/graph';
import { createGraphAccessContext } from '@canopy/graph-access';
import {
  executeSandboxedGuestPluginInWorker,
  type SandboxedGuestRenderResult,
} from '../execute-wasm-render-worker';

class FixtureWorker extends EventTarget {
  public postMessage(): void {
    return undefined;
  }

  public terminate(): void {
    return undefined;
  }
}

Object.defineProperty(globalThis, 'Worker', {
  configurable: true,
  value: FixtureWorker,
});

const context = createGraphAccessContext({
  graph: unwrap(
    createGraph(asGraphId('worker-construction-fixture'), 'Worker construction fixture'),
  ),
});

const result: SandboxedGuestRenderResult = await executeSandboxedGuestPluginInWorker(
  context,
  'render:interactive',
  '{}',
  'fixture:interactive',
  2000,
  () => {
    throw new Error('constructor blocked');
  },
);

process.stdout.write(`${JSON.stringify(result)}\n`);
