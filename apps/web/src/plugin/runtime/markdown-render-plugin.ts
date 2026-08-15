/* eslint-disable functional/no-let -- module-level instantiation cache for the WASM guest */
/* eslint-disable unicorn/no-top-level-assignment-in-function -- lazy singleton instantiation cache */
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- bridging the jco ImportObject shape */
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import type { WasmHostBindings } from '@canopy/api-adapter';
// The transpiled component and its core modules are build-time artifacts of the
// `codegen:wit` pipeline (gitignored), regenerated before every build/test. The
// graph's stored `wasm_binary` is the same component; Tier-1 executes the
// build-time-transpiled artifact bundled with the app rather than JIT-transpiling
// the stored bytes (a runtime component transpiler is deferred with Tier 2).
// eslint-disable-next-line import/extensions -- jco emits `plugin.js`; the extension is required to resolve it
import { instantiate, type ImportObject, type Root } from '../markdown/transpiled/plugin.js';
import coreUrl from '../markdown/transpiled/plugin.core.wasm?url';
import core2Url from '../markdown/transpiled/plugin.core2.wasm?url';
import core3Url from '../markdown/transpiled/plugin.core3.wasm?url';
import core4Url from '../markdown/transpiled/plugin.core4.wasm?url';

const CORE_MODULE_URLS: Readonly<Record<string, string>> = {
  'plugin.core.wasm': coreUrl,
  'plugin.core2.wasm': core2Url,
  'plugin.core3.wasm': core3Url,
  'plugin.core4.wasm': core4Url,
};

const getCoreModule = async (name: string): Promise<WebAssembly.Module> => {
  const url = CORE_MODULE_URLS[name];
  if (url === undefined) {
    throw new Error(`Unknown Markdown plugin core module: ${name}`);
  }
  const response = await fetch(url);
  return WebAssembly.compile(await response.arrayBuffer());
};

let instancePromise: Promise<Root> | undefined;

// Instantiate the Markdown component once and reuse it across every block. WASI
// imports come from the sandboxed preview2 browser shim; `plugin-manifest` is a
// pure record interface with no host functions, so an empty object satisfies it.
const instantiateOnce = (): Promise<Root> => {
  instancePromise ??= (async (): Promise<Root> => {
    const imports = {
      ...new WASIShim().getImportObject(),
      'canopy:graph/plugin-manifest': {},
    } as unknown as ImportObject;
    return instantiate(getCoreModule, imports);
  })();
  return instancePromise;
};

// `WasmGuestPlugin` adapter fed to `executeSandboxedGuestPlugin`. The Markdown
// guest declares no host capabilities, so `hostBindings` is unused; the guest's
// exported `render` returns the `{ html }` envelope (or throws a string, mapped
// to a thrown error by jco), which we re-serialize as the executor's JSON output.
export const markdownRenderGuest = async (
  _hostBindings: WasmHostBindings,
  inputJson: string,
): Promise<string> => {
  const root = await instantiateOnce();
  const output = root.contentRendering.render(inputJson);
  return JSON.stringify(output);
};
