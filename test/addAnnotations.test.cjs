const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const core = require('@actions/core');
const github = require('@actions/github');
const { GitHub } = require('@actions/github/lib/utils');

const updates = [];
core.getInput = (name) => ({ theme_root: 'theme' })[name] || '';
github.context = {
  repo: { owner: 'shop', repo: 'theme' },
  eventName: 'pull_request',
  sha: 'head',
  payload: { pull_request: { head: { sha: 'head' } } },
};
GitHub.plugin = () => class {
  constructor() {
    this.rest = {
      checks: {
        create: async () => ({ data: { id: 42 } }),
        update: async (params) => {
          updates.push(params);
          return { data: {} };
        },
      },
    };
  }
};

const { addAnnotations } = require('../src/addAnnotations');
const { normalizeThemeCheckReport } = require('../src/steps/runChecksJson');

function annotationsFromUpdates() {
  return updates.flatMap((update) => update.output.annotations || []);
}

test('creates GitHub annotations with one-based locations for CLI 5 reports', async () => {
  const cwd = process.cwd();
  const report = normalizeThemeCheckReport({
    valid: false,
    issues: [
      {
        filePath: path.join(cwd, 'theme/layout/theme.liquid'),
        check: 'MissingWidth',
        severity: 'error',
        startRow: 1,
        startColumn: 55,
        endRow: 1,
        endColumn: 72,
        message: 'Missing image dimensions',
      },
      {
        filePath: path.join(cwd, 'theme/layout/theme.liquid'),
        check: 'LiquidSyntax',
        severity: 'warning',
        startRow: 2,
        startColumn: 2,
        endRow: 3,
        endColumn: 5,
        message: 'Malformed Liquid tag',
      },
      {
        filePath: path.join(cwd, 'theme/templates/index.liquid'),
        check: 'UnusedAssign',
        severity: 'info',
        startRow: 1,
        startColumn: 1,
        endRow: 1,
        endColumn: 3,
        message: 'Unused assignment',
      },
    ],
  });

  await addAnnotations(
    report,
    '',
    'token',
    ['theme/layout/theme.liquid', 'theme/templates/index.liquid'],
  );

  assert.deepEqual(annotationsFromUpdates(), [
    {
      path: 'theme/layout/theme.liquid',
      start_line: 1,
      end_line: 1,
      start_column: 55,
      end_column: 72,
      annotation_level: 'failure',
      message: '[MissingWidth] Missing image dimensions',
    },
    {
      path: 'theme/layout/theme.liquid',
      start_line: 2,
      end_line: 3,
      start_column: undefined,
      end_column: undefined,
      annotation_level: 'warning',
      message: '[LiquidSyntax] Malformed Liquid tag',
    },
    {
      path: 'theme/templates/index.liquid',
      start_line: 1,
      end_line: 1,
      start_column: 1,
      end_column: 3,
      annotation_level: 'notice',
      message: '[UnusedAssign] Unused assignment',
    },
  ]);
});

test('keeps CLI 4 zero-based positions compatible with GitHub annotations', async () => {
  updates.length = 0;
  const report = [{
    path: path.join(process.cwd(), 'theme/layout/theme.liquid'),
    offenses: [{
      check: 'LegacyCheck',
      severity: 'warning',
      start_row: 0,
      start_column: 0,
      end_row: 0,
      end_column: 1,
      message: 'Legacy report position',
    }],
    errorCount: 0,
    warningCount: 1,
    infoCount: 0,
  }];

  await addAnnotations(report, '', 'token', ['theme/layout/theme.liquid']);

  assert.deepEqual(annotationsFromUpdates(), [{
    path: 'theme/layout/theme.liquid',
    start_line: 1,
    end_line: 1,
    start_column: 1,
    end_column: 2,
    annotation_level: 'warning',
    message: '[LegacyCheck] Legacy report position',
  }]);
});
