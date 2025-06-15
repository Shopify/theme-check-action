import * as core from '@actions/core';
import * as github from '@actions/github';
import { GitHub, getOctokitOptions } from '@actions/github/lib/utils';
import { throttling, ThrottlingOptions } from '@octokit/plugin-throttling';
import { Context } from '@actions/github/lib/context';
import { Octokit } from '@octokit/rest';
import {  RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import { stripIndent as markdown } from 'common-tags';
import { ThemeCheckReport, ThemeCheckOffense } from './types';
import * as path from 'path';

import type { PullRequest, PullRequestEvent } from '@octokit/webhooks-types';

const ThrottledOctokit = Octokit.plugin(throttling);

const CHECK_NAME = 'Theme Check Report';

type GitHubAnnotation = NonNullable<NonNullable<RestEndpointMethodTypes["checks"]["update"]["parameters"]['output']>['annotations']>[number]

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

function severityLevel(annotation: GitHubAnnotation): number {
  switch (annotation.annotation_level) {
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

function getDiffFilter(
  themeRoot: string,
  fileDiff: string[] | undefined,
): (report: ThemeCheckReport) => boolean {
  if (!fileDiff) {
    return () => true;
  }

  return (report) => {
    return (
      report.path.startsWith(themeRoot) &&
      fileDiff.includes(report.path)
    );
  };
}

export async function addAnnotations(
  reports: ThemeCheckReport[],
  exitCode: number,
  configContent: string,
  ghToken: string,
  fileDiff: string[] | undefined,
) {
  const cwd = process.cwd();
  const ctx = github.context;
  const themeRoot = core.getInput('theme_root');
  const version = core.getInput('version');
  const flags = core.getInput('flags');
  const octokit = new ThrottledOctokit({
    ...getOctokitOptions(ghToken),
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(
            `Request quota exhausted for request ${options.method} ${options.url}`,
        );

        if (retryCount < 1) {
          // only retries once
          octokit.log.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onSecondaryRateLimit: (_, options, octokit) => {
        // does not retry, only logs a warning
        octokit.log.warn(
            `SecondaryRateLimit detected for request ${options.method} ${options.url}`,
        );
      },
    } satisfies ThrottlingOptions,
  });

  console.log('Creating GitHub check...');

  const result: ThemeCheckReport[] = reports.filter(
      getDiffFilter(
          path.resolve(cwd, themeRoot),
          fileDiff?.map((x) => path.join(cwd, x)),
      ),
  );

  // Create check

  const prPayload = github.context.payload as PullRequestEvent
  const check = await octokit.rest.checks.create({
    ...ctx.repo,
    name: CHECK_NAME,
    head_sha: github.context.eventName == 'pull_request' ? prPayload.pull_request.head.sha : github.context.sha,
    status: 'in_progress',
  });

  const allAnnotations: GitHubAnnotation[] = result
    .flatMap((report) =>
      report.offenses.map((offense) => ({
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
      })),
    )
    .sort((a, b) => severityLevel(a) - severityLevel(b));

  const { errorCount, warningCount } = result.reduce((report, acc) => {
    acc.errorCount += report.errorCount;
    acc.warningCount += report.warningCount;

    return acc;
  }, { errorCount: 0, warningCount: 0 });

  // This is Octokit/Checks API annotations limit
  // https://docs.github.com/en/developers/apps/guides/creating-ci-tests-with-the-checks-api#step-24-collecting-rubocop-errors
  const annotationsChunks = splitEvery(50, allAnnotations);

  console.log('Updating GitHub Checks...');

  // Push annotations
  await Promise.all(
    annotationsChunks.map(async (annotations) =>
      octokit.rest.checks.update({
        ...ctx.repo,
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
    ...ctx.repo,
    check_run_id: check.data.id,
    name: CHECK_NAME,
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
