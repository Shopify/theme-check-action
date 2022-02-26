import * as core from '@actions/core'; // tslint:disable-line
// Currently @actions/github cannot be loaded via import statement due to typing error
const github = require('@actions/github'); // tslint:disable-line
import { Context } from '@actions/github/lib/context';
import { Octokit } from '@octokit/rest';
import { stripIndent as markdown } from 'common-tags';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const exec = promisify(require('child_process').exec);
const CHECK_NAME = 'Theme Check Report';
const exitCode = JSON.parse(process.argv[2]);

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

  const octokit = new github.GitHub(ghToken) as Octokit;

  console.log('Creating GitHub check...');

  // Create check
  const check = await octokit.checks.create({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    name: CHECK_NAME,
    head_sha: ctx.sha,
    status: 'in_progress',
  });

  console.log('Converting results.json into annotations...');

  const result = (await fs.promises
    .readFile('/tmp/results.json', 'utf8')
    .then((f: string) => JSON.parse(f))) as ThemeCheckReport[];

  const allAnnotations: Octokit.ChecksCreateParamsOutputAnnotations[] =
    result.flatMap((report: ThemeCheckReport) =>
      report.offenses.map((offense) => ({
        path: path.join(themeRoot || '.', report.path),
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

  const splitIntoChunks = (
    allAnnotations: Octokit.ChecksCreateParamsOutputAnnotations[],
  ) => {
    const chunks: Octokit.ChecksCreateParamsOutputAnnotations[][] = [];
    // this is Octokit/Checks API annotations limit
    // https://docs.github.com/en/developers/apps/guides/creating-ci-tests-with-the-checks-api#step-24-collecting-rubocop-errors
    const CHUNK_SIZE = 50;

    let i = 0;
    let nextChunk = allAnnotations.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    while (nextChunk.length > 0) {
      chunks.push(nextChunk);
      i++;
      nextChunk = allAnnotations.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    }

    return chunks;
  };
  const annotationsChunks = splitIntoChunks(allAnnotations);

  console.log('Updating GitHub Checks...');

  // Update check
  await Promise.all(
    annotationsChunks.map(async (annotations) =>
      octokit.checks.update({
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
          annotations,
        },
      }),
    ),
  );
})().catch((e) => {
  console.error(e.stack); // tslint:disable-line
  core.setFailed(e.message);
});
