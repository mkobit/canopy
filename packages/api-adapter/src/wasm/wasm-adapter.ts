import type { Result } from '@canopy/graph';
import type { ApiAdapterContext } from '../api-context';
import type { ApiAdapterError } from '../result-errors';
import type { WasmHostBindings, WasmHostBindingsOptions } from './host-bindings';
import { createWasmHostBindings } from './host-bindings';
import type { SandboxedExecutionOptions, WasmGuestPlugin } from './sandboxed-executor';
import { executeSandboxedGuestPlugin } from './sandboxed-executor';
import { CANOPY_WIT_SPECIFICATION } from './wit-spec';

export type WasmAdapterOptions = WasmHostBindingsOptions & SandboxedExecutionOptions;

export type WasmGuestPluginExecutor = (
  token: string,
  inputJson: string,
  plugin: WasmGuestPlugin,
  optionsOverride?: SandboxedExecutionOptions,
) => Promise<Result<string, ApiAdapterError>>;

export type WasmAdapterServices = Readonly<{
  executeGuestPlugin: WasmGuestPluginExecutor;
}>;

// eslint-disable-next-line functional/no-mixed-types -- WIT adapter exports schema data, host bindings, and guest plugin execution service
export type WasmAdapter = Readonly<{
  witSpec: string;
  hostBindings: WasmHostBindings;
  services: WasmAdapterServices;
  executeGuestPlugin: WasmGuestPluginExecutor;
}>;

// Creates a WebAssembly WIT host adapter over an API context.
export const createWasmAdapter = (
  context: ApiAdapterContext,
  options: WasmAdapterOptions = {},
): WasmAdapter => {
  const hostBindings = createWasmHostBindings(context, options);
  const executeGuestPlugin: WasmGuestPluginExecutor = (token, inputJson, plugin, optionsOverride) =>
    executeSandboxedGuestPlugin(context, token, inputJson, plugin, {
      ...options,
      ...(optionsOverride !== undefined && { ...optionsOverride }),
    });

  return {
    witSpec: CANOPY_WIT_SPECIFICATION,
    hostBindings,
    services: {
      executeGuestPlugin,
    },
    executeGuestPlugin,
  };
};
