"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core = require("@actions/core"); // tslint:disable-line
// Currently @actions/github cannot be loaded via import statement due to typing error
const github = require('@actions/github'); // tslint:disable-line
const { GitHub, getOctokitOptions, } = require('@actions/github/lib/utils'); // tslint:disable-line
const { throttling } = require('@octokit/plugin-throttling'); //tslint:disable-line
const common_tags_1 = require("common-tags");
const util_1 = require("util");
const fs = require("fs");
const path = require("path");
const ThrottledOctokit = GitHub.plugin(throttling);
const exec = (0, util_1.promisify)(require('child_process').exec);
const CHECK_NAME = 'Theme Check Report';
const exitCode = JSON.parse(process.argv[2]);
const SeverityConversion = {
    0: 'failure',
    1: 'warning',
    2: 'notice',
};
function splitEvery(n, array) {
    return array.reduce((acc, v, i) => {
        if (i % n === 0)
            acc.push([v]);
        else
            acc[acc.length - 1].push(v);
        return acc;
    }, []);
}
function getDiffFilter() {
    if (!fs.existsSync('/tmp/diff.log'))
        return () => true;
    const diff = fs
        .readFileSync('/tmp/diff.log', 'utf8')
        .split('\n')
        .filter(Boolean);
    return (report) => diff.includes(report.path);
}
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
    const octokit = new ThrottledOctokit({
        ...getOctokitOptions(ghToken),
        throttle: {
            onRateLimit: (retryAfter, options, octokit) => {
                octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
                if (options.request.retryCount === 0) {
                    // only retries once
                    octokit.log.info(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
            },
            onAbuseLimit: (_retryAfter, options, octokit) => {
                // does not retry, only logs a warning
                octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`);
            },
        },
    });
    console.log('Creating GitHub check...');
    const result = await fs.promises
        .readFile('/tmp/results.json', 'utf8')
        .then((f) => JSON.parse(f)
        .map((report) => ({
        ...report,
        path: path.join(themeRoot || '.', report.path),
    }))
        .filter(getDiffFilter()));
    // Create check
    const check = await octokit.rest.checks.create({
        owner: ctx.repo.owner,
        repo: ctx.repo.repo,
        name: CHECK_NAME,
        head_sha: ctx.sha,
        status: 'in_progress',
    });
    console.log('Converting results.json into annotations...');
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
    // This is Octokit/Checks API annotations limit
    // https://docs.github.com/en/developers/apps/guides/creating-ci-tests-with-the-checks-api#step-24-collecting-rubocop-errors
    const annotationsChunks = splitEvery(50, allAnnotations);
    console.log('Updating GitHub Checks...');
    // Push annotations
    await Promise.all(annotationsChunks.map(async (annotations) => octokit.rest.checks.update({
        owner: ctx.repo.owner,
        repo: ctx.repo.repo,
        check_run_id: check.data.id,
        output: {
            title: CHECK_NAME,
            summary: `${errorCount} error(s), ${suggestionCount} warning(s) found`,
            annotations,
        },
    })));
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
        },
    });
})().catch((e) => {
    console.error(e.stack); // tslint:disable-line
    core.setFailed(e.message);
});
