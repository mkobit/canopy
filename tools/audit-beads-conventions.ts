/* eslint-disable no-console, import/extensions -- CLI script */
import {
  buildAuditResult,
  formatReportBody,
  lintFindingsToReportFindings,
  parseIssueNumbers,
  parseLintOutput,
  parseQueryOutput,
  queryFindingsToReportFindings,
} from './lib/beads-audit.js';
import {
  findDriftedIssues,
  issueIdPattern,
  parseClosedIssues,
  parseCommitMessages,
} from './lib/beads-merge-check.js';

const REPORT_TITLE = '[Beads Audit Failure]';
const LABEL_QUERY = 'label=none AND status!=closed';
const ORPHAN_QUERY = 'parent=none AND type!=epic AND status!=closed';

// Only issues closed after this change landed are considered (canopy-qvn.7
// design: forward-looking only, not a backlog audit) and only once they're
// past the 48h grace period -- close-then-open-a-PR is the normal sequence.
// `bd query`'s parser rejects a bare `YYYY-MM-DD` date literal here
// (misreads the `-` as part of an unexpected token) -- it must be quoted.
const MERGE_CHECK_CUTOFF = '2026-08-08';
const MERGE_CHECK_GRACE_QUERY = `status=closed AND closed<2d AND closed>"${MERGE_CHECK_CUTOFF}"`;

type CommandOutput =
  Readonly<{ ok: true; stdout: string }> | Readonly<{ ok: false; command: string; stderr: string }>;

function run(command: readonly string[]): CommandOutput {
  const result = Bun.spawnSync([...command]);
  return result.exitCode === 0
    ? { ok: true, stdout: result.stdout.toString('utf8') }
    : { ok: false, command: command.join(' '), stderr: result.stderr.toString('utf8') };
}

function unwrap(output: CommandOutput): string {
  if (!output.ok) {
    console.error(`${output.command} failed:\n${output.stderr}`);
    process.exit(1);
  }
  return output.stdout;
}

function fetchOriginMain(): undefined {
  const outcome = run(['git', 'fetch', 'origin', 'main', '--quiet']);
  if (!outcome.ok) {
    console.error(`${outcome.command} failed:\n${outcome.stderr}`);
  }
  return undefined;
}

function reachableCommitMessages(): readonly string[] {
  const rawLog = unwrap(run(['git', 'log', 'origin/main', '--format=%x00%B']));
  return parseCommitMessages(rawLog);
}

function reportToGitHub(body: string): undefined {
  const search = unwrap(
    run([
      'gh',
      'issue',
      'list',
      '--search',
      `${REPORT_TITLE} in:title state:open`,
      '--json',
      'number',
    ]),
  );
  const existingNumbers = parseIssueNumbers(search);

  const reportCommand =
    existingNumbers.length > 0
      ? ['gh', 'issue', 'edit', String(existingNumbers[0]), '--body', body]
      : ['gh', 'issue', 'create', '--title', REPORT_TITLE, '--body', body];

  const outcome = run(reportCommand);
  if (!outcome.ok) {
    console.error(`${outcome.command} failed:\n${outcome.stderr}`);
  }
  return undefined;
}

// Local advisory check (canopy-qvn.7): reports whether a single issue ID has
// a commit reachable from origin/main, without requiring bd to support a
// blocking pre-close hook. Doesn't apply type/label exemptions -- the caller
// already knows which issue they're asking about.
function checkSingleIssue(id: string): undefined {
  fetchOriginMain();
  const commitMessages = reachableCommitMessages();
  const reachable = commitMessages.some((message) => issueIdPattern(id).test(message));
  if (reachable) {
    console.log(`${id}: reachable from origin/main`);
    process.exit(0);
  }
  console.error(`${id}: no commit reachable from origin/main`);
  process.exit(1);
}

function main(): undefined {
  const arguments_ = process.argv.slice(2);
  const checkIssueIndex = arguments_.indexOf('--check-issue');
  if (checkIssueIndex !== -1) {
    const id = arguments_[checkIssueIndex + 1];
    if (!id) {
      console.error('--check-issue requires an issue ID argument');
      process.exit(1);
    }
    checkSingleIssue(id);
    return undefined;
  }

  const shouldReport = arguments_.includes('--report');

  const lintOutput = unwrap(run(['bd', 'lint', '--json']));
  const labelOutput = unwrap(run(['bd', 'query', LABEL_QUERY, '--json']));
  const orphanOutput = unwrap(run(['bd', 'query', ORPHAN_QUERY, '--json']));
  const mergeCheckOutput = unwrap(run(['bd', 'query', MERGE_CHECK_GRACE_QUERY, '--json']));

  fetchOriginMain();
  const commitMessages = reachableCommitMessages();
  const driftedIssues = findDriftedIssues(parseClosedIssues(mergeCheckOutput), commitMessages);

  const lintFindings = lintFindingsToReportFindings(parseLintOutput(lintOutput));
  const labelFindings = queryFindingsToReportFindings(
    parseQueryOutput(labelOutput),
    'missing-label',
  );
  const mergeDriftFindings = queryFindingsToReportFindings(driftedIssues, 'unmerged-close');
  const orphanFindings = queryFindingsToReportFindings(
    parseQueryOutput(orphanOutput),
    'orphan-informational',
  );

  const result = buildAuditResult(lintFindings, labelFindings, mergeDriftFindings, orphanFindings);
  const body = formatReportBody(result) || 'No findings.';
  console.log(body);

  // CI (--report): only the non-noisy "failing" categories (lint,
  // missing-label) trigger the tracking issue and a non-zero exit --
  // unmerged-close/orphan are informational-only (see buildAuditResult).
  // Local (no --report): a human is reading this directly, so any finding
  // at all -- including informational ones -- should be visible as a
  // non-zero exit, not just the CI-failing subset.
  if (shouldReport) {
    if (!result.failed) {
      process.exit(0);
    }
    reportToGitHub(body);
    process.exit(1);
  }

  const hasAnyFindings = result.failed || result.informationalFindings.length > 0;
  process.exit(hasAnyFindings ? 1 : 0);
}

main();
