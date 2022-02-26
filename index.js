"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core = require("@actions/core"); // tslint:disable-line
// Currently @actions/github cannot be loaded via import statement due to typing error
const github = require('@actions/github'); // tslint:disable-line
const common_tags_1 = require("common-tags");
const util_1 = require("util");
const fs = require("fs");
const path = require("path");
const exec = (0, util_1.promisify)(require('child_process').exec);
const CHECK_NAME = 'Theme Check Report';
const exitCode = JSON.parse(process.argv[2]);
const SeverityConversion = {
    0: 'failure',
    1: 'warning',
    2: 'notice',
};
(async () => {
    const ctx = github.context;
    const themeRoot = core.getInput('theme_root');
    const version = core.getInput('version');
    const flags = core.getInput('flags');
    const ghToken = core.getInput('token');
    if (!ghToken) {
        core.setFailed('theme-check-action: Please set token');
        return;
    }
    const octokit = new github.GitHub(ghToken);
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
        .then((f) => JSON.parse(f)));
    const allAnnotations = result.flatMap((report) => report.offenses.map((offense) => ({
        path: path.join(themeRoot || '.', report.path),
        start_line: offense.start_row + 1,
        end_line: offense.end_row + 1,
        start_column: offense.start_row == offense.end_row
            ? offense.start_column
            : undefined,
        end_column: offense.start_row == offense.end_row
            ? offense.end_column
            : undefined,
        annotation_level: SeverityConversion[offense.severity],
        message: `[${offense.check}] ${offense.message}`,
    })));
    const errorCount = result
        .map((x) => x.errorCount)
        .reduce((a, b) => a + b, 0);
    const suggestionCount = result
        .map((x) => x.suggestionCount)
        .reduce((a, b) => a + b, 0);
    const splitIntoChunks = (allAnnotations) => {
        const chunks = [];
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
    await Promise.all(annotationsChunks.map(async (annotations) => octokit.checks.update({
        owner: ctx.repo.owner,
        repo: ctx.repo.repo,
        check_run_id: check.data.id,
        name: CHECK_NAME,
        status: 'completed',
        conclusion: exitCode > 0 ? 'failure' : 'success',
        output: {
            title: CHECK_NAME,
            summary: `${errorCount} error(s), ${suggestionCount} warning(s) found`,
            text: (0, common_tags_1.stripIndent) `
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
          `.replace('__CONFIG_CONTENT__', await exec(`theme-check --print ${themeRoot}`).then((o) => o.stdout)),
            annotations,
        },
    })));
})().catch((e) => {
    console.error(e.stack); // tslint:disable-line
    core.setFailed(e.message);
});
