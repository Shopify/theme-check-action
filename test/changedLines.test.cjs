const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { filterReportsToChangedLines } = require('../src/steps/filterChangedLines');
const { getFileDiff, parseGitDiff } = require('../src/steps/getFileDiff');

test('parses added line ranges from a multi-file unified diff', () => {
  const diff = [
    'diff --git a/templates/a file.liquid b/templates/a file.liquid',
    'index 1111111..2222222 100644',
    '--- a/templates/a file.liquid',
    '+++ b/templates/a file.liquid',
    '@@ -2,3 +2,4 @@',
    '+added line',
    '+++ b/this-is-content',
    '@@ -10 +11 @@',
    'diff --git a/templates/café.liquid b/templates/café.liquid',
    '--- a/templates/café.liquid',
    '+++ b/templates/café.liquid',
    '@@ -3 +3 @@',
    'diff --git a/config/settings_data.json b/config/settings_data.json',
    '--- a/config/settings_data.json',
    '+++ b/config/settings_data.json',
    '@@ -20 +21,0 @@',
  ].join('\n');

  const parsed = parseGitDiff(diff);
  assert.deepEqual(parsed.files, [
    'templates/a file.liquid',
    'templates/café.liquid',
    'config/settings_data.json',
  ]);
  assert.deepEqual({ ...parsed.changedLines }, {
    'templates/a file.liquid': [
      { start: 2, end: 5 },
      { start: 11, end: 11 },
    ],
    'templates/café.liquid': [{ start: 3, end: 3 }],
    'config/settings_data.json': [],
  });
});

test('rejects quoted Git paths rather than silently skipping changed lines', () => {
  const diff = [
    'diff --git a/templates/product.liquid b/templates/product.liquid',
    '--- a/templates/product.liquid',
    '+++ b/"templates/caf\\303\\251.liquid"',
    '@@ -1 +1 @@',
  ].join('\n');

  assert.throws(() => parseGitDiff(diff), /cannot safely parse a quoted path/);
});

test('gets changed line ranges and preserves the existing file-only diff', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-check-diff-'));
  const repository = path.join(root, 'repo');
  const remote = path.join(root, 'origin.git');
  fs.mkdirSync(repository);
  fs.mkdirSync(path.join(repository, 'templates'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  runGit(root, 'init', '--bare', remote);
  runGit(repository, 'init', '-b', 'main');
  runGit(repository, 'config', 'user.name', 'Theme Check test');
  runGit(repository, 'config', 'user.email', 'theme-check@example.invalid');
  fs.writeFileSync(path.join(repository, 'product.liquid'), 'first\nsecond\n');
  fs.writeFileSync(path.join(repository, 'templates', 'café.liquid'), 'old\n');
  runGit(repository, 'add', '.');
  runGit(repository, 'commit', '-m', 'base');
  runGit(repository, 'remote', 'add', 'origin', remote);
  runGit(repository, 'push', '-u', 'origin', 'main');
  fs.writeFileSync(
    path.join(repository, 'product.liquid'),
    'first\nsecond changed\n',
  );
  fs.writeFileSync(path.join(repository, 'templates', 'café.liquid'), 'new\n');

  const lineDiff = await getFileDiff('main', repository, true);
  const fileDiff = await getFileDiff('main', repository);
  const originalFileList = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMRTUB', 'origin/main'],
    { cwd: repository, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);

  assert.deepEqual(lineDiff.files.sort(), [
    'product.liquid',
    'templates/café.liquid',
  ]);
  assert.deepEqual(lineDiff.changedLines['product.liquid'], [
    { start: 2, end: 2 },
  ]);
  assert.deepEqual(lineDiff.changedLines['templates/café.liquid'], [
    { start: 1, end: 1 },
  ]);
  assert.deepEqual(fileDiff.files, originalFileList);
});

test('preserves changed-line offenses for real Git paths containing spaces', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-check-spaces-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  runGit(root, 'init');
  const paths = ['a file.liquid', 'trailing space.liquid '];
  for (const file of paths) fs.writeFileSync(path.join(root, file), 'old\n');
  runGit(root, 'add', '.');
  runGit(
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-m',
    'base',
  );
  for (const file of paths) fs.writeFileSync(path.join(root, file), 'new\n');
  const diff = execFileSync(
    'git',
    ['-c', 'core.quotePath=false', 'diff', '--unified=0'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  const parsed = parseGitDiff(diff);
  const reports = filterReportsToChangedLines(
    paths.map((file) => ({
      path: path.join(root, file),
      offenses: [offense('error', 0, 0)],
      errorCount: 1,
      warningCount: 0,
      infoCount: 0,
    })),
    parsed.changedLines,
    root,
  );
  assert.deepEqual(
    reports.map(({ errorCount }) => errorCount),
    [1, 1],
  );
  assert.deepEqual(parsed.files, paths);

  // Literal tabs in filenames are quoted by Git, not header delimiters.
  fs.writeFileSync(path.join(root, 'literal\ttab.liquid'), 'old\n');
  runGit(root, 'add', '.');
  runGit(
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-m',
    'tab path',
  );
  fs.writeFileSync(path.join(root, 'literal\ttab.liquid'), 'new\n');
  const quotedDiff = execFileSync(
    'git',
    ['-c', 'core.quotePath=false', 'diff', '--unified=0'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  assert.throws(
    () => parseGitDiff(quotedDiff),
    /cannot safely parse a quoted path/,
  );
});

test('keeps offenses overlapping changed lines and recalculates report counts', () => {
  const root = '/repo';
  const [report] = filterReportsToChangedLines(
    [
      {
        path: path.join(root, 'templates/product.liquid'),
        offenses: [
          offense('error', 1, 1), // unchanged line
          offense('warning', 2, 2), // changed line
          offense('info', 2, 4), // range crosses a changed line
        ],
        errorCount: 1,
        warningCount: 1,
        infoCount: 1,
      },
    ],
    { 'templates/product.liquid': [{ start: 3, end: 3 }] },
    root,
  );

  assert.deepEqual(report.offenses.map((item) => item.severity), [
    'warning',
    'info',
  ]);
  assert.equal(report.errorCount, 0);
  assert.equal(report.warningCount, 1);
  assert.equal(report.infoCount, 1);
});

test('filters unchanged files but keeps offenses without a usable location', () => {
  const [changedReport, unchangedReport] = filterReportsToChangedLines(
    [
      {
        path: '/repo/templates/changed.liquid',
        offenses: [offense('error', 0, 0)],
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
      },
      {
        path: '/repo/templates/unchanged.liquid',
        offenses: [
          offense('warning', 2, 2),
          { ...offense('error', 2, 2), start_row: Number.NaN },
        ],
        errorCount: 1,
        warningCount: 1,
        infoCount: 0,
      },
    ],
    { 'templates/changed.liquid': [{ start: 1, end: 1 }] },
    '/repo',
  );

  assert.equal(changedReport.errorCount, 1);
  assert.equal(changedReport.offenses.length, 1);
  assert.equal(unchangedReport.errorCount, 1);
  assert.equal(unchangedReport.offenses.length, 1);
  assert.equal(unchangedReport.warningCount, 0);
});

test('matches relative report paths when the theme root is a repository subdirectory', () => {
  const repositoryRoot = '/repo';
  const themeRoot = path.join(repositoryRoot, 'dawn');
  const [report] = filterReportsToChangedLines(
    [
      {
        path: 'layout/theme.liquid',
        offenses: [offense('error', 0, 0)],
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
      },
    ],
    { 'dawn/layout/theme.liquid': [{ start: 1, end: 1 }] },
    repositoryRoot,
    themeRoot,
  );

  assert.equal(report.offenses.length, 1);
  assert.equal(report.errorCount, 1);
});

test('fails closed when report counts do not match its offenses', () => {
  const [report] = filterReportsToChangedLines(
    [
      {
        path: '/repo/templates/product.liquid',
        offenses: [offense('error', 2, 2)],
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
      },
    ],
    {},
    '/repo',
  );

  assert.equal(report.errorCount, 1);
});

function offense(severity, start_row, end_row) {
  return {
    check: 'TestCheck',
    severity,
    start_row,
    start_column: 0,
    end_row,
    end_column: 1,
    message: 'Example offence',
  };
}

function runGit(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}
