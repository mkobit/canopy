/* eslint-disable functional/no-return-void */
import type { Result } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import type { ApiAdapterContext } from '../api-context';
import type { ApiAdapterError } from '../result-errors';
import { createApiAdapterError } from '../result-errors';
import type { CapabilityValidator } from './capabilities';
import type { FuelMeter, MemoryChecker, ReentrancyGuard, WasmHostBindings } from './host-bindings';
import { createWasmHostBindings } from './host-bindings';

// UTF-8 byte length via TextEncoder so the executor runs in both Node and the
// browser (the web render path). `Buffer` is Node-only and is not defined in a
// browser bundle.
const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).length;

// Default execution boundaries for WebAssembly guest plugins.
export const DEFAULT_WASM_FUEL_LIMIT = 1_000_000n;
export const DEFAULT_WASM_MAX_MEMORY_BYTES = 16 * 1024 * 1024;
export const DEFAULT_WASM_TIMEOUT_MS = 5000;

export type WasmGuestPlugin = (
  hostBindings: WasmHostBindings,
  inputJson: string,
) => Promise<string> | string;

export type SandboxedExecutionOptions = Readonly<{
  fuelLimit?: bigint;
  maxMemoryBytes?: number;
  timeoutMs?: number;
  validateCapability?: CapabilityValidator;
}>;

// Creates a stateful fuel meter to bound host and guest operations.
export const createFuelMeter = (initialLimit: bigint): FuelMeter => {
  // eslint-disable-next-line functional/no-let -- encapsulated fuel state
  let remainingUnits = initialLimit;

  return {
    consume: (units: bigint): Result<void, ApiAdapterError> => {
      if (units <= 0n) {
        return ok(undefined);
      }
      if (remainingUnits < units) {
        remainingUnits = 0n;
        return err(
          createApiAdapterError('RESOURCE_EXHAUSTED', 'WASM execution fuel limit exceeded'),
        );
      }
      remainingUnits -= units;
      return ok(undefined);
    },
    remaining: (): bigint => remainingUnits,
  };
};

// Creates a reentrancy guard preventing nested host imports during execution.
export const createReentrancyGuard = (): ReentrancyGuard => {
  // eslint-disable-next-line functional/no-let -- encapsulated execution flag
  let inFlight = false;

  return {
    enter: (): Result<void, ApiAdapterError> => {
      if (inFlight) {
        return err(createApiAdapterError('FORBIDDEN', 'Reentrant host import call is prohibited'));
      }
      inFlight = true;
      return ok(undefined);
    },
    exit: (): void => {
      inFlight = false;
    },
  };
};

// Creates a memory quota checker verifying byte allocation bounds.
export const createMemoryChecker = (maxMemoryBytes: number): MemoryChecker => ({
  checkBytes: (bytes: number): Result<void, ApiAdapterError> => {
    if (bytes > maxMemoryBytes) {
      return err(
        createApiAdapterError(
          'RESOURCE_EXHAUSTED',
          `WASM memory quota exceeded: ${bytes} bytes exceeds maximum limit of ${maxMemoryBytes} bytes`,
        ),
      );
    }
    return ok(undefined);
  },
});

// Executes a WebAssembly guest plugin within a sandboxed boundary.
export const executeSandboxedGuestPlugin = async (
  context: ApiAdapterContext,
  token: string,
  inputJson: string,
  plugin: WasmGuestPlugin,
  options: SandboxedExecutionOptions = {},
): Promise<Result<string, ApiAdapterError>> => {
  const fuelLimit = options.fuelLimit ?? context.limits?.wasmFuelLimit ?? DEFAULT_WASM_FUEL_LIMIT;
  const maxMemoryBytes = options.maxMemoryBytes ?? DEFAULT_WASM_MAX_MEMORY_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_WASM_TIMEOUT_MS;

  const memoryChecker = createMemoryChecker(maxMemoryBytes);
  const inputBytes = utf8ByteLength(inputJson);
  const inputMemoryResult = memoryChecker.checkBytes(inputBytes);
  if (!inputMemoryResult.ok) {
    return err(inputMemoryResult.error);
  }

  const fuelMeter = createFuelMeter(fuelLimit);
  const reentrancyGuard = createReentrancyGuard();

  const hostBindings = createWasmHostBindings(context, {
    fuelMeter,
    reentrancyGuard,
    memoryChecker,
    ...(options.validateCapability !== undefined && {
      validateCapability: options.validateCapability,
    }),
  });

  const timeoutPromise = new Promise<Result<string, ApiAdapterError>>((resolve) => {
    const timer = setTimeout(() => {
      resolve(
        err(
          createApiAdapterError(
            'RESOURCE_EXHAUSTED',
            `WASM guest execution timed out after ${timeoutMs}ms`,
          ),
        ),
      );
    }, timeoutMs);

    if (typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  });

  const executionPromise = (async (): Promise<Result<string, ApiAdapterError>> => {
    // eslint-disable-next-line functional/no-try-statements -- defensive exception guard for WASM guest plugin execution
    try {
      const outputJson = await plugin(hostBindings, inputJson);
      const outputBytes = utf8ByteLength(outputJson);
      const outputMemoryResult = memoryChecker.checkBytes(outputBytes);
      if (!outputMemoryResult.ok) {
        return err(outputMemoryResult.error);
      }
      return ok(outputJson);
    } catch (error) {
      return err(
        createApiAdapterError(
          'INTERNAL_ERROR',
          `WASM guest plugin execution failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  })();

  return Promise.race([executionPromise, timeoutPromise]);
};
