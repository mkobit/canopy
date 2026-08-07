import path from 'node:path';
import { expect, test } from 'bun:test';
import {
  extractFilePathsFromPayload,
  isEslintSupported,
  isPrettierSupported,
  rootDirectory,
} from './agent-format-lint-hook.js';

test('extractFilePathsFromPayload handles single file_path', () => {
  const payload = {
    tool_input: {
      file_path: 'packages/graph/src/index.ts',
    },
  };
  const paths = extractFilePathsFromPayload(payload);
  expect(paths).toEqual([path.resolve(rootDirectory, 'packages/graph/src/index.ts')]);
});

test('extractFilePathsFromPayload handles edits array', () => {
  const payload = {
    tool_input: {
      edits: [
        { file_path: 'packages/graph/src/index.ts' },
        { file_path: 'packages/queries/src/index.ts' },
      ],
    },
  };
  const paths = extractFilePathsFromPayload(payload);
  expect(paths).toEqual([
    path.resolve(rootDirectory, 'packages/graph/src/index.ts'),
    path.resolve(rootDirectory, 'packages/queries/src/index.ts'),
  ]);
});

test('extractFilePathsFromPayload deduplicates identical file paths', () => {
  const payload = {
    tool_input: {
      file_path: 'packages/graph/src/index.ts',
      edits: [{ file_path: 'packages/graph/src/index.ts' }],
    },
  };
  const paths = extractFilePathsFromPayload(payload);
  expect(paths).toEqual([path.resolve(rootDirectory, 'packages/graph/src/index.ts')]);
});

test('extractFilePathsFromPayload filters out non-existent files and directories', () => {
  const payload = {
    tool_input: {
      edits: [
        { file_path: 'packages/graph/src/non-existent-file.ts' },
        { file_path: 'packages/graph' }, // directory, not regular file
      ],
    },
  };
  const paths = extractFilePathsFromPayload(payload);
  expect(paths).toEqual([]);
});

test('extractFilePathsFromPayload filters out paths outside rootDirectory', () => {
  const payload = {
    tool_input: {
      file_path: '/etc/passwd',
    },
  };
  const paths = extractFilePathsFromPayload(payload);
  expect(paths).toEqual([]);
});

test('extractFilePathsFromPayload returns empty list for empty payload', () => {
  expect(extractFilePathsFromPayload({})).toEqual([]);
});

test('isPrettierSupported identifies supported file extensions', () => {
  expect(isPrettierSupported('file.ts')).toBe(true);
  expect(isPrettierSupported('file.tsx')).toBe(true);
  expect(isPrettierSupported('file.js')).toBe(true);
  expect(isPrettierSupported('file.jsx')).toBe(true);
  expect(isPrettierSupported('file.json')).toBe(true);
  expect(isPrettierSupported('file.md')).toBe(true);
  expect(isPrettierSupported('file.css')).toBe(true);
  expect(isPrettierSupported('file.yaml')).toBe(true);
  expect(isPrettierSupported('file.yml')).toBe(true);

  expect(isPrettierSupported('file.py')).toBe(false);
  expect(isPrettierSupported('file.wasm')).toBe(false);
  expect(isPrettierSupported('file')).toBe(false);
});

test('isEslintSupported identifies supported file extensions', () => {
  expect(isEslintSupported('file.ts')).toBe(true);
  expect(isEslintSupported('file.tsx')).toBe(true);
  expect(isEslintSupported('file.js')).toBe(true);
  expect(isEslintSupported('file.jsx')).toBe(true);
  expect(isEslintSupported('file.mjs')).toBe(true);
  expect(isEslintSupported('file.cjs')).toBe(true);

  expect(isEslintSupported('file.json')).toBe(false);
  expect(isEslintSupported('file.css')).toBe(false);
  expect(isEslintSupported('file.md')).toBe(false);
  expect(isEslintSupported('file.py')).toBe(false);
});
