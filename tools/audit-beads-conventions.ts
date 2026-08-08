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

const REPORT_TITLE = '[Beads Audit Failure]';
const LABEL_QUERY = 'label=none AND status!=closed';
const ORPHAN_QUERY = 'parent=none AND type!=epic AND status!=closed';

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

function main(): undefined {
  const shouldReport = process.argv.includes('--report');

  // Open issues only (bd lint's default) -- `--status all` would walk the
  // full closed-issue history on every run, unbounded cost for a routine check.
  const lintOutput = unwrap(run(['bd', 'lint', '--json']));
  const labelOutput = unwrap(run(['bd', 'query', LABEL_QUERY, '--json']));
  const orphanOutput = unwrap(run(['bd', 'query', ORPHAN_QUERY, '--json']));

  const lintFindings = lintFindingsToReportFindings(parseLintOutput(lintOutput));
  const labelFindings = queryFindingsToReportFindings(
    parseQueryOutput(labelOutput),
    'missing-label',
  );
  const orphanFindings = queryFindingsToReportFindings(
    parseQueryOutput(orphanOutput),
    'orphan-informational',
  );

  const result = buildAuditResult(lintFindings, labelFindings, orphanFindings);
  const body = formatReportBody(result) || 'No findings.';
  console.log(body);

  if (!result.failed) {
    process.exit(0);
  }

  if (shouldReport) {
    reportToGitHub(body);
  }

  process.exit(1);
}

main();
