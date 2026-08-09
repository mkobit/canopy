import { expect, test } from 'bun:test';
import {
  buildAuditResult,
  formatReportBody,
  lintFindingsToReportFindings,
  parseIssueNumbers,
  parseLintOutput,
  parseQueryOutput,
  queryFindingsToReportFindings,
} from './lib/beads-audit.js';

test('parseLintOutput extracts findings from a populated results array', () => {
  const raw = JSON.stringify({
    total: 1,
    issues: 1,
    results: [
      {
        id: 'canopy-abc',
        title: 'Do the thing',
        type: 'task',
        missing: ['## Acceptance Criteria'],
      },
    ],
  });
  expect(parseLintOutput(raw)).toEqual([
    { id: 'canopy-abc', title: 'Do the thing', missing: ['## Acceptance Criteria'] },
  ]);
});

test('parseLintOutput treats a null results field as zero findings', () => {
  // Verified against a real `bd lint --json` run: zero findings returns
  // `"results": null`, not `"results": []`.
  const raw = JSON.stringify({ total: 0, issues: 0, results: null });
  expect(parseLintOutput(raw)).toEqual([]);
});

test('parseQueryOutput drops extra fields like description', () => {
  const raw = JSON.stringify([
    {
      id: 'canopy-abc',
      title: 'Do the thing',
      description: 'a very long description',
      status: 'open',
    },
  ]);
  expect(parseQueryOutput(raw)).toEqual([{ id: 'canopy-abc', title: 'Do the thing' }]);
});

test('parseQueryOutput handles an empty array', () => {
  expect(parseQueryOutput('[]')).toEqual([]);
});

test('parseIssueNumbers extracts numbers from gh issue list --json number output', () => {
  const raw = JSON.stringify([{ number: 42 }, { number: 7 }]);
  expect(parseIssueNumbers(raw)).toEqual([42, 7]);
});

test('buildAuditResult fails when lint or label findings exist', () => {
  const lint = lintFindingsToReportFindings([
    { id: 'canopy-a', title: 'A', missing: ['## Acceptance Criteria'] },
  ]);
  const result = buildAuditResult(lint, [], [], []);
  expect(result.failed).toBe(true);
  expect(result.failingFindings).toHaveLength(1);
});

test('buildAuditResult never fails on unmerged-close findings alone', () => {
  // A real coverage measurement (2026-08-08) found a 37.5% false-positive
  // rate for this check -- too noisy to fail a run on. See design.md.
  const drift = queryFindingsToReportFindings([{ id: 'canopy-c', title: 'C' }], 'unmerged-close');
  const result = buildAuditResult([], [], drift, []);
  expect(result.failed).toBe(false);
  expect(result.informationalFindings).toHaveLength(1);
});

test('buildAuditResult never fails on orphan-informational findings alone', () => {
  const orphan = queryFindingsToReportFindings(
    [{ id: 'canopy-b', title: 'B' }],
    'orphan-informational',
  );
  const result = buildAuditResult([], [], [], orphan);
  expect(result.failed).toBe(false);
  expect(result.informationalFindings).toHaveLength(1);
});

test('buildAuditResult combines unmerged-close and orphan findings as informational', () => {
  const drift = queryFindingsToReportFindings([{ id: 'canopy-c', title: 'C' }], 'unmerged-close');
  const orphan = queryFindingsToReportFindings(
    [{ id: 'canopy-b', title: 'B' }],
    'orphan-informational',
  );
  const result = buildAuditResult([], [], drift, orphan);
  expect(result.failed).toBe(false);
  expect(result.informationalFindings).toHaveLength(2);
});

test('formatReportBody renders empty string when there are no findings at all', () => {
  const result = buildAuditResult([], [], [], []);
  expect(formatReportBody(result)).toBe('');
});

test('formatReportBody separates failing, drift, and informational sections', () => {
  const lint = lintFindingsToReportFindings([
    { id: 'canopy-a', title: 'A', missing: ['## Acceptance Criteria'] },
  ]);
  const drift = queryFindingsToReportFindings([{ id: 'canopy-c', title: 'C' }], 'unmerged-close');
  const orphan = queryFindingsToReportFindings(
    [{ id: 'canopy-b', title: 'B' }],
    'orphan-informational',
  );
  const body = formatReportBody(buildAuditResult(lint, [], drift, orphan));
  expect(body).toContain('Missing recommended sections (bd lint)');
  expect(body).toContain('canopy-a');
  expect(body).toContain('Informational: closed but not reachable from origin/main');
  expect(body).toContain('canopy-c');
  expect(body).toContain('Informational: parentless, non-epic issues');
  expect(body).toContain('canopy-b');
});
