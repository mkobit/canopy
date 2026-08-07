const CHANGE_PATH_PATTERN = /(?:^|\/)openspec\/changes\/(?!archive\/)([^/]+)\//;

function resolveChangeName(filePath: string): string | undefined {
  return filePath.match(CHANGE_PATH_PATTERN)?.[1];
}

export type OpenspecValidationResult = Readonly<{
  name: string;
  passed: boolean;
  output: string;
}>;

export function validateOpenspecChange(
  name: string,
  rootDirectory: string,
): OpenspecValidationResult {
  const result = Bun.spawnSync(['bunx', 'openspec', 'validate', name, '--strict'], {
    cwd: rootDirectory,
  });
  const passed = result.exitCode === 0;
  const output = `${result.stdout.toString('utf8')}${result.stderr.toString('utf8')}`.trim();
  return { name, passed, output };
}

export function uniqueChangeNamesFromPaths(paths: readonly string[]): readonly string[] {
  const names = paths.map(resolveChangeName).filter((name): name is string => name !== undefined);
  return [...new Set(names)];
}
