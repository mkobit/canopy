// Default code-bearing issue types (canopy-qvn.7 design): issues of these
// types are expected to correspond to a commit. `spike`/`epic`/`decision`/
// `story`/`milestone` are excluded by default -- they routinely close without
// their own commit (their children, or just a doc, carry the work).
const DEFAULT_CODE_BEARING_TYPES: ReadonlySet<string> = new Set([
  'task',
  'bug',
  'feature',
  'chore',
]);

export type ClosedIssue = Readonly<{
  id: string;
  title: string;
  type: string;
  labels: readonly string[];
}>;

// A `no-code` label always exempts; a `code-bearing` label always opts in
// (e.g. a spike that did produce a commit). Otherwise, fall back to the
// default type list.
export function isCheckable(issue: ClosedIssue): boolean {
  if (issue.labels.includes('no-code')) {
    return false;
  }
  if (issue.labels.includes('code-bearing')) {
    return true;
  }
  return DEFAULT_CODE_BEARING_TYPES.has(issue.type);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

// Boundary-anchored on both sides: `canopy-qvn` must not match inside
// `canopy-qvn.5` or `xcanopy-qvn`, and `.7` must not match inside `.70`.
export function issueIdPattern(id: string): Readonly<RegExp> {
  return new RegExp(String.raw`(?<![a-zA-Z0-9])${escapeRegExp(id)}(?![a-zA-Z0-9]|\.[0-9])`);
}

export function isReachable(id: string, commitMessages: readonly string[]): boolean {
  const pattern = issueIdPattern(id);
  return commitMessages.some((message) => pattern.test(message));
}

export type DriftedIssue = Readonly<{
  id: string;
  title: string;
}>;

// Reverted commits and squash-merges that omit the ID are known, accepted
// gaps (see design.md) -- this only answers "is there a reachable commit
// mentioning this ID," not "is the feature currently present on main."
export function findDriftedIssues(
  issues: readonly ClosedIssue[],
  commitMessages: readonly string[],
): readonly DriftedIssue[] {
  return issues
    .filter(isCheckable)
    .filter((issue) => !isReachable(issue.id, commitMessages))
    .map((issue) => ({ id: issue.id, title: issue.title }));
}

// `git log --format=%x00%B` output: NUL-separated raw commit bodies.
export function parseCommitMessages(rawGitLog: string): readonly string[] {
  return rawGitLog.split('\0').filter((message) => message.trim().length > 0);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString);
}

type RawClosedIssue = Readonly<{ id: string; title: string; issue_type: string }>;

function isRawClosedIssue(value: unknown): value is RawClosedIssue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    isString(value.id) &&
    'title' in value &&
    isString(value.title) &&
    'issue_type' in value &&
    isString(value.issue_type)
  );
}

// `bd query --json` omits the `labels` key entirely for unlabeled issues.
function extractLabels(value: unknown): readonly string[] {
  if (
    typeof value === 'object' &&
    value !== null &&
    'labels' in value &&
    isStringArray(value.labels)
  ) {
    return value.labels;
  }
  return [];
}

// `bd query --json` uses `issue_type`, not `type`, as the field name.
export function parseClosedIssues(raw: string): readonly ClosedIssue[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.flatMap((item): readonly ClosedIssue[] => {
    if (!isRawClosedIssue(item)) {
      return [];
    }
    return [{ id: item.id, title: item.title, type: item.issue_type, labels: extractLabels(item) }];
  });
}
