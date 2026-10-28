const assert = require('node:assert/strict');
const { test } = require('node:test');
const actionsExec = require('@actions/exec');
const { normalizeThemeCheckReport, runChecksJson } = require('../src/steps/runChecksJson');

const cliV5Output = {
  valid: false,
  issues: [
    {
      filePath: '/theme/layout/theme.liquid',
      check: 'ImgWidthAndHeight',
      severity: 'error',
      startRow: 1,
      startColumn: 55,
      endRow: 1,
      endColumn: 72,
      message: 'Missing width and height attributes on img tag',
    },
    {
      filePath: '/theme/layout/theme.liquid',
      check: 'RemoteAsset',
      severity: 'warning',
      startRow: 4,
      startColumn: 2,
      endRow: 4,
      endColumn: 5,
      message: 'Prefer a local asset',
    },
    {
      filePath: '/theme/templates/index.liquid',
      check: 'UnusedAssign',
      severity: 'info',
      startRow: 2,
      startColumn: 3,
      endRow: 3,
      endColumn: 1,
      message: 'This assign is unused',
    },
  ],
  errorCount: 1,
  warningCount: 1,
  infoCount: 1,
};

test('keeps the grouped Shopify CLI 4.x report format', () => {
  const reports = [
    {
      path: '/theme/layout/theme.liquid',
      offenses: [],
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
    },
  ];

  assert.strictEqual(normalizeThemeCheckReport(reports), reports);
});

test('groups Shopify CLI 5.x issues and restores zero-based positions', () => {
  const reports = normalizeThemeCheckReport(cliV5Output);

  assert.deepEqual(reports, [
    {
      path: '/theme/layout/theme.liquid',
      offenses: [
        {
          check: 'ImgWidthAndHeight',
          severity: 'error',
          start_row: 0,
          start_column: 54,
          end_row: 0,
          end_column: 71,
          message: 'Missing width and height attributes on img tag',
        },
        {
          check: 'RemoteAsset',
          severity: 'warning',
          start_row: 3,
          start_column: 1,
          end_row: 3,
          end_column: 4,
          message: 'Prefer a local asset',
        },
      ],
      errorCount: 1,
      warningCount: 1,
      infoCount: 0,
    },
    {
      path: '/theme/templates/index.liquid',
      offenses: [
        {
          check: 'UnusedAssign',
          severity: 'info',
          start_row: 1,
          start_column: 2,
          end_row: 2,
          end_column: 0,
          message: 'This assign is unused',
        },
      ],
      errorCount: 0,
      warningCount: 0,
      infoCount: 1,
    },
  ]);
});

test('normalizes Shopify CLI 5.x stdout in runChecksJson', async () => {
  const originalGetExecOutput = actionsExec.getExecOutput;
  let commandArgs;
  actionsExec.getExecOutput = async (_executable, args) => {
    commandArgs = args;
    return { exitCode: 1, stdout: JSON.stringify(cliV5Output), stderr: '' };
  };

  try {
    const result = await runChecksJson('/theme', 'shopify', false);

    assert.deepEqual(commandArgs, [
      'theme',
      'check',
      '--output',
      'json',
      '--path',
      '/theme',
    ]);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.report, normalizeThemeCheckReport(cliV5Output));
  } finally {
    actionsExec.getExecOutput = originalGetExecOutput;
  }
});

test('rejects unsupported JSON output instead of passing it to annotation processing', () => {
  assert.throws(
    () => normalizeThemeCheckReport({ error: { message: 'Theme configuration is invalid' } }),
    {
      name: 'TypeError',
      message: 'Unsupported Shopify CLI theme check JSON report format',
    },
  );
  assert.throws(
    () => normalizeThemeCheckReport({ issues: [] }),
    {
      name: 'TypeError',
      message: 'Unsupported Shopify CLI theme check JSON report format',
    },
  );
});
