const hasExport = (module: object, name: string): boolean => Object.hasOwn(module, name);

const graphAccess = await import('@canopy/graph-access');
const pluginHost = await import('@canopy/plugin-host');
const apiAdapter = await import('@canopy/api-adapter');

const required = [
  [graphAccess, 'createGraphAccessContext'],
  [graphAccess, 'createGraphAccessRequest'],
  [graphAccess, 'executeQuery'],
  [graphAccess, 'createGraphAccessError'],
  [pluginHost, 'createWasmAdapter'],
  [pluginHost, 'executeSandboxedGuestPlugin'],
  [pluginHost, 'CANOPY_WIT_SPECIFICATION'],
  [apiAdapter, 'createIpcServer'],
  [apiAdapter, 'buildGraphQLSchema'],
  [apiAdapter, 'toGrpcStatus'],
] as const;

const removedApiAdapterExports = [
  'createGraphAccessContext',
  'createGraphAccessRequest',
  'executeQuery',
  'createWasmAdapter',
  'executeSandboxedGuestPlugin',
  'CANOPY_WIT_SPECIFICATION',
] as const;

const errors = [
  ...required
    .filter(([module, name]) => !hasExport(module, name))
    .map(([, name]) => `Missing built public export ${name}`),
  ...removedApiAdapterExports
    .filter((name) => hasExport(apiAdapter, name))
    .map((name) => `Removed export ${name} is still available from @canopy/api-adapter`),
];

if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(
  'Built graph-access, plugin-host, and api-adapter public exports resolve correctly.\n',
);
