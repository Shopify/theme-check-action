import { getExecOutput } from '@actions/exec';
import type { ThemeCheckOffense, ThemeCheckReport } from '../types';

interface ShopifyCliJsonIssue {
  filePath: string;
  check: string;
  severity: ThemeCheckOffense['severity'];
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isShopifyCliJsonIssue(value: unknown): value is ShopifyCliJsonIssue {
  return (
    isRecord(value) &&
    typeof value.filePath === 'string' &&
    value.filePath.length > 0 &&
    typeof value.check === 'string' &&
    (value.severity === 'error' || value.severity === 'warning' || value.severity === 'info') &&
    isPositiveInteger(value.startRow) &&
    isPositiveInteger(value.startColumn) &&
    isPositiveInteger(value.endRow) &&
    isPositiveInteger(value.endColumn) &&
    typeof value.message === 'string'
  );
}

export function normalizeThemeCheckReport(report: unknown): ThemeCheckReport[] {
  if (Array.isArray(report)) {
    return report as ThemeCheckReport[];
  }

  if (!isRecord(report) || typeof report.valid !== 'boolean' || !Array.isArray(report.issues)) {
    throw new TypeError('Unsupported Shopify CLI theme check JSON report format');
  }

  const issues = report.issues.filter(isShopifyCliJsonIssue);
  if (issues.length !== report.issues.length) {
    throw new TypeError('Unsupported Shopify CLI theme check JSON report format');
  }

  const reportsByPath = new Map<string, ThemeCheckReport>();
  for (const issue of issues) {
    let fileReport = reportsByPath.get(issue.filePath);
    if (!fileReport) {
      fileReport = {
        path: issue.filePath,
        offenses: [],
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
      };
      reportsByPath.set(issue.filePath, fileReport);
    }

    fileReport.offenses.push({
      check: issue.check,
      severity: issue.severity,
      start_row: issue.startRow - 1,
      start_column: issue.startColumn - 1,
      end_row: issue.endRow - 1,
      end_column: issue.endColumn - 1,
      message: issue.message,
    });

    if (issue.severity === 'error') fileReport.errorCount++;
    else if (issue.severity === 'warning') fileReport.warningCount++;
    else fileReport.infoCount++;
  }

  return Array.from(reportsByPath.values());
}

export async function runChecksJson(
  root: string,
  shopifyExecutable: string = 'shopify',
  devPreview = true,
  flags = '',
) {
  const { exitCode, stdout, stderr } = await getExecOutput(
    shopifyExecutable,
    [
      'theme',
      'check',
      devPreview ? '--dev-preview' : undefined,
      ...flags.split(' '),
      ...['--output', 'json'],
      ...['--path', root],
    ].filter((x): x is string => Boolean(x)),
    {
      silent: true,
      ignoreReturnCode: true,
    },
  );
  console.error(stderr);

  return {
    exitCode,
    report: normalizeThemeCheckReport(JSON.parse(stdout)),
  };
}
