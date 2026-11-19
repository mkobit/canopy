const hasExport = (module: object, name: string): boolean => Object.hasOwn(module, name);

const graphAccess = await import('@canopy/graph-access');
const pluginHost = await import('@canopy/plugin-host');

const required = [
  [graphAccess, 'createGraphAccessContext'],
  [graphAccess, 'createGraphAccessRequest'],
  [graphAccess, 'executeQuery'],
  [graphAccess, 'createGraphAccessError'],
  [graphAccess, 'CANOPY_V0_ROUTES'],
  [graphAccess, 'createCanopyV0InProcessHandlers'],
  [graphAccess, 'createCanopyV0ServerRouter'],
  [graphAccess, 'createCanopyV0Client'],
  [pluginHost, 'createWasmAdapter'],
  [pluginHost, 'executeSandboxedGuestPlugin'],
  [pluginHost, 'CANOPY_WIT_SPECIFICATION'],
] as const;

const errors = required
  .filter(([module, name]) => !hasExport(module, name))
  .map(([, name]) => `Missing built public export ${name}`);

if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write('Built graph-access and plugin-host public exports resolve correctly.\n');
