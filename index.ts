import * as core from '@actions/core'; // tslint:disable-line
// Currently @actions/github cannot be loaded via import statement due to typing error
const github = require('@actions/github'); // tslint:disable-line
const {
  GitHub,
  getOctokitOptions,
} = require('@actions/github/lib/utils'); // tslint:disable-line
const { throttling } = require('@octokit/plugin-throttling'); //tslint:disable-line
import { Context } from '@actions/github/lib/context';
import { Octokit } from '@octokit/rest';
import { stripIndent as markdown } from 'common-tags';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const ThrottledOctokit = GitHub.plugin(throttling);

const exec = promisify(require('child_process').exec);
const CHECK_NAME = 'Theme Check Report';
const exitCode = JSON.parse(process.argv[2]);

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

interface ThemeCheckOffense {
  check: string;
  severity: 0 | 1 | 2;
  start_row: number;
  start_column: number;
  end_row: number;
  end_column: number;
  message: string;
}

interface ThemeCheckReport {
  path: string;
  offenses: ThemeCheckOffense[];
  errorCount: number;
  suggestionCount: number;
  styleCount: number;
}

const SeverityConversion: {
  [k: number]: 'failure' | 'warning' | 'notice';
} = {
  0: 'failure',
  1: 'warning',
  2: 'notice',
};

function splitEvery<T>(n: number, array: T[]): T[][] {
  return array.reduce((acc: T[][], v, i) => {
    if (i % n === 0) acc.push([v]);
    else acc[acc.length - 1].push(v);
    return acc;
  }, []);
}

function getDiffFilter(
  themeRoot: string,
): (report: ThemeCheckReport) => boolean {
  if (!fs.existsSync('/tmp/diff.log')) return () => true;
  const diff: string[] = fs
    .readFileSync('/tmp/diff.log', 'utf8')
    .split('\n')
    .filter(Boolean)
    .concat(path.join(themeRoot || '.', ''));
  return (report) => diff.includes(report.path);
}

function getPath(
  report: ThemeCheckReport,
  offense: ThemeCheckOffense,
) {
  if (offense.check === 'MissingRequiredTemplateFiles') {
    return offense.message.match(/'([^']*)'/)?.[1] || report.path;
  }
  return report.path;
}

(async () => {
  const ctx = github.context as Context;
  const themeRoot = core.getInput('theme_root');
  const version = core.getInput('version');
  const flags = core.getInput('flags');
  const ghToken = core.getInput('token');

  if (!ghToken) {
    core.setFailed('theme-check-action: Please set token');
    return;
  }

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

  const result: ThemeCheckReport[] = await fs.promises
    .readFile('/tmp/results.json', 'utf8')
    .then((f: string) =>
      JSON.parse(f)
        .map((report: ThemeCheckReport) => ({
          ...report,
          path: path.join(themeRoot || '.', report.path || ''),
        }))
        .filter(getDiffFilter(themeRoot)),
    );

  // Create check
  const check = await octokit.rest.checks.create({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    name: CHECK_NAME,
    head_sha: ctx.sha,
    status: 'in_progress',
  });

  console.log('Converting results.json into annotations...');

  const allAnnotations: GitHubAnnotation[] = result.flatMap(
    (report: ThemeCheckReport) =>
      report.offenses.map((offense) => ({
        path: getPath(report, offense),
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
  );

  const errorCount = result
    .map((x) => x.errorCount)
    .reduce((a, b) => a + b, 0);
  const suggestionCount = result
    .map((x) => x.suggestionCount)
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
          summary: `${errorCount} error(s), ${suggestionCount} warning(s) found`,
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
      summary: `${errorCount} error(s), ${suggestionCount} warning(s) found`,
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
          `.replace(
        '__CONFIG_CONTENT__',
        await exec(`theme-check --print ${themeRoot}`).then(
          (o: any) => o.stdout,
        ),
      ),
    },
  });
})().catch((e) => {
  console.error(e.stack); // tslint:disable-line
  core.setFailed(e.message);
});
