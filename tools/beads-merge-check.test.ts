import { expect, test } from 'bun:test';
import {
  findDriftedIssues,
  isCheckable,
  isReachable,
  issueIdPattern,
  parseClosedIssues,
  parseCommitMessages,
} from './lib/beads-merge-check.js';

test('isCheckable defaults to task/bug/feature/chore', () => {
  expect(isCheckable({ id: 'a', title: 'A', type: 'task', labels: [] })).toBe(true);
  expect(isCheckable({ id: 'a', title: 'A', type: 'bug', labels: [] })).toBe(true);
  expect(isCheckable({ id: 'a', title: 'A', type: 'feature', labels: [] })).toBe(true);
  expect(isCheckable({ id: 'a', title: 'A', type: 'chore', labels: [] })).toBe(true);
});

test('isCheckable excludes epic/decision/story/milestone/spike by default', () => {
  for (const type of ['epic', 'decision', 'story', 'milestone', 'spike']) {
    expect(isCheckable({ id: 'a', title: 'A', type, labels: [] })).toBe(false);
  }
});

test('isCheckable no-code label exempts an otherwise code-bearing type', () => {
  expect(isCheckable({ id: 'a', title: 'A', type: 'task', labels: ['no-code'] })).toBe(false);
});

test('isCheckable code-bearing label opts in a spike', () => {
  expect(isCheckable({ id: 'a', title: 'A', type: 'spike', labels: ['code-bearing'] })).toBe(true);
});

test('isCheckable no-code wins if both labels are present', () => {
  expect(
    isCheckable({ id: 'a', title: 'A', type: 'task', labels: ['no-code', 'code-bearing'] }),
  ).toBe(false);
});

test('issueIdPattern does not match a short ID inside a longer related ID', () => {
  const pattern = issueIdPattern('canopy-qvn');
  expect(pattern.test('fix things (canopy-qvn.5)')).toBe(false);
  expect(pattern.test('fix things (canopy-qvn)')).toBe(true);
});

test('issueIdPattern does not match a numeric suffix as a substring', () => {
  const pattern = issueIdPattern('canopy-c54.1');
  expect(pattern.test('canopy-c54.10 landed')).toBe(false);
  expect(pattern.test('canopy-c54.1 landed')).toBe(true);
});

test('issueIdPattern does not match when preceded by another alphanumeric', () => {
  const pattern = issueIdPattern('canopy-qvn');
  expect(pattern.test('xcanopy-qvn was fixed')).toBe(false);
});

test('isReachable finds an ID across multiple commit messages', () => {
  expect(isReachable('canopy-abc', ['unrelated', 'fix (canopy-abc)'])).toBe(true);
  expect(isReachable('canopy-abc', ['unrelated', 'fix (canopy-xyz)'])).toBe(false);
});

test('findDriftedIssues only reports checkable, unreachable issues', () => {
  const issues = [
    { id: 'canopy-a', title: 'A', type: 'task', labels: [] },
    { id: 'canopy-b', title: 'B', type: 'task', labels: [] },
    { id: 'canopy-c', title: 'C', type: 'epic', labels: [] },
    { id: 'canopy-d', title: 'D', type: 'task', labels: ['no-code'] },
  ];
  const commitMessages = ['landed canopy-a'];
  expect(findDriftedIssues(issues, commitMessages)).toEqual([{ id: 'canopy-b', title: 'B' }]);
});

test('parseCommitMessages splits on NUL and drops blank entries', () => {
  const raw = 'first message\0second message\0\0';
  expect(parseCommitMessages(raw)).toEqual(['first message', 'second message']);
});

test('parseClosedIssues maps issue_type to type and keeps labels', () => {
  const raw = JSON.stringify([
    { id: 'canopy-a', title: 'A', issue_type: 'task', labels: ['beads', 'ci'] },
  ]);
  expect(parseClosedIssues(raw)).toEqual([
    { id: 'canopy-a', title: 'A', type: 'task', labels: ['beads', 'ci'] },
  ]);
});

test('parseClosedIssues defaults labels to an empty array when the key is absent', () => {
  const raw = JSON.stringify([{ id: 'canopy-a', title: 'A', issue_type: 'task' }]);
  expect(parseClosedIssues(raw)).toEqual([
    { id: 'canopy-a', title: 'A', type: 'task', labels: [] },
  ]);
});

test('parseClosedIssues drops malformed entries', () => {
  expect(parseClosedIssues(JSON.stringify([{ id: 'canopy-a' }]))).toEqual([]);
});
