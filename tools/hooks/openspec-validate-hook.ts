/* eslint-disable no-console, import/extensions -- Claude Code PostToolUse hook script */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uniqueChangeNamesFromPaths, validateOpenspecChange } from '../lib/openspec-change.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(__dirname, '..', '..');

type ToolInput = Readonly<{
  file_path?: string;
  edits?: readonly Readonly<{ file_path?: string }>[];
}>;

type HookPayload = Readonly<{
  tool_input?: ToolInput;
}>;

function extractFilePaths(payload: HookPayload): readonly string[] {
  const input = payload.tool_input;
  if (!input) {
    return [];
  }
  const directPath = input.file_path ? [input.file_path] : [];
  const editPaths = (input.edits ?? [])
    .map((edit) => edit.file_path)
    .filter((filePath): filePath is string => filePath !== undefined);
  return [...directPath, ...editPaths];
}

async function main(): Promise<void> {
  const stdinText = await new Response(Bun.stdin.stream()).text();
  const raw = stdinText.trim();
  const payload = raw.length > 0 ? (JSON.parse(raw) as HookPayload) : {};

  const changeNames = uniqueChangeNamesFromPaths(extractFilePaths(payload));

  if (changeNames.length === 0) {
    process.exit(0);
  }

  const failures = changeNames
    .map((name) => validateOpenspecChange(name, rootDirectory))
    .filter((result) => !result.passed);

  if (failures.length > 0) {
    const reason = failures
      .map((failure) => `openspec change "${failure.name}" failed validation:\n${failure.output}`)
      .join('\n\n');
    console.log(JSON.stringify({ decision: 'block', reason }));
  }

  process.exit(0);
}

main().catch((error: unknown): undefined => {
  console.error('openspec-validate-hook: unexpected error', error);
  process.exit(0);
});
