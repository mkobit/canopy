/* eslint-disable no-console -- Agent PostToolUse hook script */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDirectory = path.resolve(__dirname, '..', '..');

export type ToolInput = Readonly<{
  file_path?: string;
  edits?: readonly Readonly<{ file_path?: string }>[];
}>;

export type HookPayload = Readonly<{
  tool_input?: ToolInput;
}>;

export function extractFilePathsFromPayload(payload: HookPayload): readonly string[] {
  const input = payload.tool_input;
  if (!input) {
    return [];
  }
  const directPath = input.file_path ? [input.file_path] : [];
  const editPaths = (input.edits ?? [])
    .map((edit) => edit.file_path)
    .filter((filePath): filePath is string => filePath !== undefined);

  const rawPaths = [...directPath, ...editPaths];
  const uniquePaths = [...new Set(rawPaths)];

  return uniquePaths
    .map((p) => (path.isAbsolute(p) ? p : path.resolve(rootDirectory, p)))
    .filter(
      (p) =>
        (p === rootDirectory || p.startsWith(`${rootDirectory}${path.sep}`)) &&
        fs.existsSync(p) &&
        fs.statSync(p).isFile(),
    );
}

export function isPrettierSupported(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.yaml', '.yml'].includes(
    extension,
  );
}

export function isEslintSupported(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(extension);
}

async function runFormatAndLint(filePaths: readonly string[]): Promise<void> {
  const prettierFiles = filePaths.filter(isPrettierSupported);
  const eslintFiles = filePaths.filter(isEslintSupported);

  if (prettierFiles.length > 0) {
    // eslint-disable-next-line functional/no-try-statements -- hook script process failure fallback
    try {
      const proc = Bun.spawn(['bunx', 'prettier', '--write', ...prettierFiles], {
        cwd: rootDirectory,
        stdout: 'ignore',
        stderr: 'inherit',
      });
      await proc.exited;
    } catch (error) {
      console.error('agent-format-lint-hook: prettier failed', error);
    }
  }

  if (eslintFiles.length > 0) {
    // eslint-disable-next-line functional/no-try-statements -- hook script process failure fallback
    try {
      const proc = Bun.spawn(['bunx', 'eslint', '--fix', '--cache', ...eslintFiles], {
        cwd: rootDirectory,
        stdout: 'ignore',
        stderr: 'inherit',
      });
      await proc.exited;
    } catch (error) {
      console.error('agent-format-lint-hook: eslint failed', error);
    }
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line functional/no-try-statements -- hook script main error safety wrap
  try {
    const stdinText = await new Response(Bun.stdin.stream()).text();
    const raw = stdinText.trim();
    const payload = raw.length > 0 ? (JSON.parse(raw) as HookPayload) : {};

    const targetFiles = extractFilePathsFromPayload(payload);
    if (targetFiles.length > 0) {
      await runFormatAndLint(targetFiles);
    }
  } catch (error) {
    console.error('agent-format-lint-hook: error processing input', error);
  }
  process.exit(0);
}

if (import.meta.main) {
  void main();
}
