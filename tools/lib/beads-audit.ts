function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString);
}

export type LintFinding = Readonly<{
  id: string;
  title: string;
  missing: readonly string[];
}>;

function isLintFinding(value: unknown): value is LintFinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    isString(value.id) &&
    'title' in value &&
    isString(value.title) &&
    'missing' in value &&
    isStringArray(value.missing)
  );
}

// `bd lint --json` returns `results: null` (not `[]`) when there are zero findings.
export function parseLintOutput(raw: string): readonly LintFinding[] {
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('results' in parsed) ||
    !Array.isArray(parsed.results)
  ) {
    return [];
  }
  return parsed.results
    .filter(isLintFinding)
    .map((finding) => ({ id: finding.id, title: finding.title, missing: finding.missing }));
}

export type QueryIssueSummary = Readonly<{
  id: string;
  title: string;
}>;

function isQueryIssueSummary(value: unknown): value is QueryIssueSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    isString(value.id) &&
    'title' in value &&
    isString(value.title)
  );
}

// `bd query --json` returns a bare array of full issue objects (including `description`);
// this drops everything except id/title before it reaches a report.
export function parseQueryOutput(raw: string): readonly QueryIssueSummary[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isQueryIssueSummary).map((issue) => ({ id: issue.id, title: issue.title }));
}

export function parseIssueNumbers(raw: string): readonly number[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter(
      (item): item is { number: unknown } =>
        typeof item === 'object' && item !== null && 'number' in item,
    )
    .map((item) => item.number)
    .filter((value): value is number => typeof value === 'number');
}

export type FindingCheck = 'lint' | 'missing-label' | 'unmerged-close' | 'orphan-informational';

export type Finding = Readonly<{
  check: FindingCheck;
  id: string;
  title: string;
  detail?: string;
}>;

export function lintFindingsToReportFindings(findings: readonly LintFinding[]): readonly Finding[] {
  return findings.map((finding) => ({
    check: 'lint' as const,
    id: finding.id,
    title: finding.title,
    detail: `Missing: ${finding.missing.join(', ')}`,
  }));
}

export function queryFindingsToReportFindings(
  issues: readonly QueryIssueSummary[],
  check: 'missing-label' | 'unmerged-close' | 'orphan-informational',
): readonly Finding[] {
  return issues.map((issue) => ({ check, id: issue.id, title: issue.title }));
}

export type AuditResult = Readonly<{
  failed: boolean;
  failingFindings: readonly Finding[];
  informationalFindings: readonly Finding[];
}>;

// Only lint/missing-label findings can fail the run. unmerged-close and
// orphan-informational never do: a real coverage measurement (2026-08-08,
// 48 issues closed in the prior 14 days) found 18/48 (37.5%) would be
// flagged as "drifted" even though most had genuinely landed -- squash-merge
// commit messages routinely don't cite every closed issue's ID. That's too
// noisy to fail a run on; see design.md's rollout-safety revision.
export function buildAuditResult(
  lintFindings: readonly Finding[],
  labelFindings: readonly Finding[],
  mergeDriftFindings: readonly Finding[],
  orphanFindings: readonly Finding[],
): AuditResult {
  const failingFindings = [...lintFindings, ...labelFindings];
  return {
    failed: failingFindings.length > 0,
    failingFindings,
    informationalFindings: [...mergeDriftFindings, ...orphanFindings],
  };
}

function formatSection(heading: string, findings: readonly Finding[]): string {
  if (findings.length === 0) {
    return '';
  }
  const items = findings
    .map(
      (finding) =>
        `- \`${finding.id}\` ${finding.title}${finding.detail ? ` — ${finding.detail}` : ''}`,
    )
    .join('\n');
  return `### ${heading}\n\n${items}\n`;
}

export function formatReportBody(result: AuditResult): string {
  const lintSection = formatSection(
    'Missing recommended sections (bd lint)',
    result.failingFindings.filter((finding) => finding.check === 'lint'),
  );
  const labelSection = formatSection(
    'Missing labels',
    result.failingFindings.filter((finding) => finding.check === 'missing-label'),
  );
  const mergeDriftSection = formatSection(
    'Informational: closed but not reachable from origin/main (approximation, not a failure -- see design.md)',
    result.informationalFindings.filter((finding) => finding.check === 'unmerged-close'),
  );
  const orphanSection = formatSection(
    'Informational: parentless, non-epic issues (approximation, not a failure -- see design.md)',
    result.informationalFindings.filter((finding) => finding.check === 'orphan-informational'),
  );
  return [lintSection, labelSection, mergeDriftSection, orphanSection]
    .filter((section) => section.length > 0)
    .join('\n');
}
