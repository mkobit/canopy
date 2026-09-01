/* eslint-disable functional/no-return-void */
import type { Result } from '@canopy/graph';
import { err } from '@canopy/graph';
import type { ApiAdapterError } from '../result-errors';
import { createApiAdapterError } from '../result-errors';
import { DEFAULT_WASM_MAX_MEMORY_BYTES } from './sandboxed-executor';

// Untrusted-render wall-clock deadline. Deliberately shorter than the Tier-1
// `DEFAULT_WASM_TIMEOUT_MS` (5000 ms): `memory.grow` toward 4 GiB is synchronous
// and can OOM the tab before a wall-clock `terminate()` fires, so a tighter
// deadline plus the hard memory ceiling below bound a runaway guest before it
// exhausts the host (design decision 3a / adversarial finding 6).
export const DEFAULT_UNTRUSTED_RENDER_TIMEOUT_MS = 2000;

const WASM_PAGE_BYTES = 64 * 1024;

// Hard ceiling for guest WebAssembly linear memory, in 64 KiB pages. Matches
// `DEFAULT_WASM_MAX_MEMORY_BYTES` (16 MiB → 256 pages). Instantiating guest
// memory with `maximum` bounds `memory.grow` at the engine level, unlike
// `createMemoryChecker`, which only bounds host↔guest payload byte length.
export const GUEST_MEMORY_MAX_PAGES = DEFAULT_WASM_MAX_MEMORY_BYTES / WASM_PAGE_BYTES;

// Creates a guest linear memory with a hard `maximum` so a memory-bomb guest is
// bounded by the engine (a `grow` past the ceiling throws) rather than allowed
// to allocate until the tab is out of memory (finding 6).
export const createCappedGuestMemory = (
  initialPages = 1,
  maximumPages: number = GUEST_MEMORY_MAX_PAGES,
): WebAssembly.Memory => new WebAssembly.Memory({ initial: initialPages, maximum: maximumPages });

// Removes the `Worker` constructor from a worker's global scope so a guest
// running inside the worker cannot spawn a nested worker that outlives
// `terminate()` of its host worker (design decision 3a / finding 7). Returns
// whether the constructor was present, so a startup assertion can verify it.
export const hardenGuestWorkerScope = (scope: object): boolean => {
  const hadWorker = typeof Reflect.get(scope, 'Worker') === 'function';
  if (hadWorker) {
    Reflect.deleteProperty(scope, 'Worker');
  }
  return hadWorker;
};

// A guest execution the host can forcibly stop. `execute` runs the guest and
// resolves the executor `Result`; `terminate` tears down the underlying isolate
// (e.g. `Worker.terminate()`), so a synchronous-runaway guest that never
// resolves `execute` is still stopped when the wall-clock deadline fires.
export type TerminableGuestRunner = Readonly<{
  execute: () => Promise<Result<string, ApiAdapterError>>;
  terminate: () => void;
}>;

const createDeadline = (
  runner: TerminableGuestRunner,
  timeoutMs: number,
): Readonly<{ promise: Promise<Result<string, ApiAdapterError>>; cancel: () => void }> => {
  const cancelController = new AbortController();
  const promise = new Promise<Result<string, ApiAdapterError>>((resolve) => {
    const timer = setTimeout(() => {
      runner.terminate();
      resolve(
        err(
          createApiAdapterError(
            'RESOURCE_EXHAUSTED',
            `Untrusted guest execution exceeded the ${timeoutMs}ms wall-clock deadline and was terminated`,
          ),
        ),
      );
    }, timeoutMs);

    if (typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') {
      timer.unref();
    }

    cancelController.signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
      },
      { once: true },
    );
  });

  return {
    promise,
    cancel: () => {
      cancelController.abort();
    },
  };
};

// Races a terminable guest run against a wall-clock deadline the host owns. On
// deadline the runner is `terminate()`d and a bounded `RESOURCE_EXHAUSTED` error
// resolves — never a hang — so the caller renders a fallback rather than mounting
// partial output (spec: terminable-plugin-execution → host-enforced wall-clock
// termination). The timer runs on the caller's thread, so it fires regardless of
// whether the guest ever yields.
export const executeTerminableGuest = async (
  runner: TerminableGuestRunner,
  timeoutMs: number = DEFAULT_UNTRUSTED_RENDER_TIMEOUT_MS,
): Promise<Result<string, ApiAdapterError>> => {
  const deadline = createDeadline(runner, timeoutMs);

  const run = runner
    .execute()
    .catch((error: unknown) =>
      err(
        createApiAdapterError(
          'INTERNAL_ERROR',
          `Worker-isolated guest execution failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
    );

  const outcome = await Promise.race([run, deadline.promise]);
  deadline.cancel();
  return outcome;
};
