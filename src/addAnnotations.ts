import * as core from '@actions/core';
import * as github from '@actions/github';
import { GitHub, getOctokitOptions } from '@actions/github/lib/utils';
import { throttling } from '@octokit/plugin-throttling';
import { Context } from '@actions/github/lib/context';
import { Octokit } from '@octokit/rest';
import { stripIndent as markdown } from 'common-tags';
import { ThemeCheckReport, ThemeCheckOffense } from './types';
import * as path from 'path';
import * as util from "util";

const ThrottledOctokit = GitHub.plugin(throttling);

const CHECK_NAME = 'Theme Check Report';

// It's really hard to get that type out of their SDK. output?annotations? prevents us from extracting it.
// from node_modules/@octokit/openapi-types/types.d.ts
interface GitHubAnnotation {
  /** The path of the file to add an annotation to. For example, `assets/css/main.css`. */
  path: string;
  /** The start line of the annotation. */
  start_line: number;
  /** The end line of the annotation. */
  end_line: number;
  /** The start column of the annotation. Annotations only support `start_column` and `end_column` on the same line. Omit this parameter if `start_line` and `end_line` have different values. */
  start_column?: number;
  /** The end column of the annotation. Annotations only support `start_column` and `end_column` on the same line. Omit this parameter if `start_line` and `end_line` have different values. */
  end_column?: number;
  /** The level of the annotation. Can be one of `notice`, `warning`, or `failure`. */
  annotation_level: 'notice' | 'warning' | 'failure';
  /** A short description of the feedback for these lines of code. The maximum size is 64 KB. */
  message: string;
  /** The title that represents the annotation. The maximum size is 255 characters. */
  title?: string;
  /** Details about this annotation. The maximum size is 64 KB. */
  raw_details?: string;
}

const SeverityConversion: {
  [k in ThemeCheckOffense['severity']]:
    | 'failure'
    | 'warning'
    | 'notice';
} = {
  error: 'failure',
  warning: 'warning',
  info: 'notice',
};

function splitEvery<T>(n: number, array: T[]): T[][] {
  return array.reduce((acc: T[][], v, i) => {
    if (i % n === 0) acc.push([v]);
    else acc[acc.length - 1].push(v);
    return acc;
  }, []);
}

export async function addAnnotations(
  reports: ThemeCheckReport[],
  exitCode: number,
  configContent: string,
  ghToken: string,
  fileDiff: string[] | undefined,
) {
  const cwd = process.cwd();
  const ctx = github.context as Context;
  const themeRoot = core.getInput('theme_root');
  const version = core.getInput('version');
  const flags = core.getInput('flags');

  const octokit = new ThrottledOctokit({
    ...getOctokitOptions(ghToken),
    throttle: {
      onRateLimit: (
        retryAfter: number,
        options: any,
        octokit: Octokit,
      ) => {
        octokit.log.warn(
          `Request quota exhausted for request ${options.method} ${options.url}`,
        );

        if (options.request.retryCount === 0) {
          // only retries once
          octokit.log.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onAbuseLimit: (
        _retryAfter: number,
        options: any,
        octokit: Octokit,
      ) => {
        // does not retry, only logs a warning
        octokit.log.warn(
          `Abuse detected for request ${options.method} ${options.url}`,
        );
      },
    },
  }) as Octokit;

  console.log('Creating GitHub check...');

  const root = path.resolve(cwd, themeRoot);

  // Create check
  const check = await octokit.rest.checks.create({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    name: CHECK_NAME,
    head_sha: ctx.sha,
    status: 'in_progress',
  });

  const allAnnotations: GitHubAnnotation[] = reports
    .flatMap((report: ThemeCheckReport) =>
      report.offenses.map((offense) => {
        console.log({root, path: path.resolve(report.path), origPath: report.path});

        return {
          path: path.relative(cwd, path.resolve(report.path)),
              start_line: offense.start_row + 1,
            end_line: offense.end_row + 1,
            start_column:
          offense.start_row == offense.end_row
              ? offense.start_column
              : undefined,
              end_column:
          offense.start_row == offense.end_row
              ? offense.end_column
              : undefined,
              annotation_level: SeverityConversion[offense.severity],
            message: `[${offense.check}] ${offense.message}`,
        }
      }),
    )
    .sort((a, b) => severity(a) - severity(b));

  console.log(util.inspect(allAnnotations, false, null, true /* enable colors */))

  function severity(a: GitHubAnnotation): number {
    switch (a.annotation_level) {
      case 'notice':
        return 2;
      case 'warning':
        return 1;
      case 'failure':
        return 0;
      default:
        return 3;
    }
  }

  const errorCount = reports
    .map((x) => x.errorCount)
    .reduce((a, b) => a + b, 0);
  const warningCount = reports
    .map((x) => x.warningCount)
    .reduce((a, b) => a + b, 0);

  // This is Octokit/Checks API annotations limit
  // https://docs.github.com/en/developers/apps/guides/creating-ci-tests-with-the-checks-api#step-24-collecting-rubocop-errors
  const annotationsChunks = splitEvery(50, allAnnotations);

  console.log('Updating GitHub Checks...');

  // Push annotations
  await Promise.all(
    annotationsChunks.map(async (annotations) =>
      octokit.rest.checks.update({
        owner: ctx.repo.owner,
        repo: ctx.repo.repo,
        check_run_id: check.data.id,
        output: {
          title: CHECK_NAME,
          summary: `${errorCount} error(s), ${warningCount} warning(s) found`,
          annotations,
        },
      }),
    ),
  );

  // Add final report
  await octokit.rest.checks.update({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    check_run_id: check.data.id,
    name: CHECK_NAME,
    status: 'completed',
    conclusion: exitCode > 0 ? 'failure' : 'success',
    output: {
      title: CHECK_NAME,
      summary: `${errorCount} error(s), ${warningCount} warning(s) found`,
      text: markdown`
            ## Configuration
            #### Actions Input
            | Name | Value |
            | ---- | ----- |
            | theme_root | \`${themeRoot || '(not provided)'}\` |
            | flags | \`${flags || '(not provided)'}\` |
            | version | \`${version || '(not provided)'}\` |
            #### ThemeCheck Configuration
            \`\`\`yaml
            __CONFIG_CONTENT__
            \`\`\`
            </details>
          `.replace('__CONFIG_CONTENT__', configContent),
    },
  });
}
