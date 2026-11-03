import * as path from 'path';
import { LineRange } from './getFileDiff';
import { ThemeCheckOffense, ThemeCheckReport } from '../types';

export function filterReportsToChangedLines(
  reports: ThemeCheckReport[],
  changedLines: Record<string, LineRange[]>,
  repositoryRoot: string,
  reportRoot = repositoryRoot,
): ThemeCheckReport[] {
  return reports.map((report) => {
    const originalCounts = countOffenses(report.offenses);
    if (
      originalCounts.errorCount !== report.errorCount ||
      originalCounts.warningCount !== report.warningCount ||
      originalCounts.infoCount !== report.infoCount
    ) {
      // If the JSON report is inconsistent, do not filter it. Keep the larger
      // counts so an incomplete report cannot make the check pass.
      return {
        ...report,
        errorCount:
          Number.isInteger(report.errorCount) && report.errorCount >= 0
            ? Math.max(report.errorCount, originalCounts.errorCount)
            : Math.max(1, originalCounts.errorCount),
        warningCount: Math.max(
          validCount(report.warningCount),
          originalCounts.warningCount,
        ),
        infoCount: Math.max(
          validCount(report.infoCount),
          originalCounts.infoCount,
        ),
      };
    }

    const reportPath = toGitPath(
      path.relative(
        repositoryRoot,
        path.resolve(reportRoot, report.path),
      ),
    );
    const ranges = changedLines[reportPath] || [];
    const offenses = report.offenses.filter((offense) =>
      isOnChangedLine(offense, ranges),
    );

    return {
      ...report,
      offenses,
      ...countOffenses(offenses),
    };
  });
}

function validCount(count: number): number {
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function countOffenses(offenses: ThemeCheckOffense[]) {
  return offenses.reduce(
    (counts, offense) => {
      switch (offense.severity) {
        case 'warning':
          counts.warningCount++;
          break;
        case 'info':
          counts.infoCount++;
          break;
        case 'error':
        default:
          counts.errorCount++;
      }
      return counts;
    },
    { errorCount: 0, warningCount: 0, infoCount: 0 },
  );
}

function isOnChangedLine(
  offense: ThemeCheckOffense,
  ranges: LineRange[],
): boolean {
  // Keep diagnostics without usable locations: the action cannot prove that
  // they are outside the changed lines, so filtering them would fail open.
  if (
    !Number.isInteger(offense.start_row) ||
    !Number.isInteger(offense.end_row) ||
    offense.start_row < 0 ||
    offense.end_row < offense.start_row
  ) {
    return true;
  }

  const start = offense.start_row + 1;
  const end = offense.end_row + 1;
  return ranges.some((range) => start <= range.end && end >= range.start);
}

function toGitPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
