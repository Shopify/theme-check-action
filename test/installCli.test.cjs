const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const runStep = path.resolve(__dirname, '../scripts/run-step');
const tsNodeRegister = require.resolve('ts-node/register');

test('keeps using npm for repositories that do not use pnpm', (t) => {
  const fixture = createFixture(t, {
    packageJson: { name: 'theme' },
    managers: ['npm', 'pnpm'],
  });

  const result = runInstall(fixture, '3.58.0');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    lastLine(result.stdout),
    path.join(
      fs.realpathSync(fixture.repository),
      'node_modules',
      '.bin',
      'shopify',
    ),
  );
  assert.deepEqual(readCommands(fixture), [
    'npm install --no-package-lock --no-save @shopify/cli@3.58.0 @shopify/theme@3.58.0',
  ]);
});

test('uses pnpm for a workspace without changing its package files', (t) => {
  const packageJson = {
    name: 'theme-workspace',
    private: true,
    packageManager: 'pnpm@10.0.0',
    devDependencies: { '@example/theme': 'workspace:*' },
  };
  const fixture = createFixture(t, {
    packageJson,
    managers: ['npm', 'pnpm'],
  });
  const originalPackageJson = fs.readFileSync(
    path.join(fixture.repository, 'package.json'),
  );
  const originalNpmrc = fs.readFileSync(path.join(fixture.repository, '.npmrc'));

  const result = runInstall(fixture, '3.58.0');

  assert.equal(result.status, 0, result.stderr);
  const executable = lastLine(result.stdout);
  const installDirectory = path.resolve(executable, '../../..');
  assert.ok(installDirectory.startsWith(fixture.runnerTemp));
  assert.deepEqual(readCommands(fixture), [
    'pnpm --version',
    `pnpm add --dir ${installDirectory} --no-lockfile @shopify/cli@3.58.0 @shopify/theme@3.58.0`,
  ]);
  assert.deepEqual(
    fs.readFileSync(path.join(fixture.repository, 'package.json')),
    originalPackageJson,
  );
  assert.deepEqual(
    fs.readFileSync(path.join(fixture.repository, '.npmrc')),
    originalNpmrc,
  );
  assert.deepEqual(
    fs.readFileSync(path.join(installDirectory, '.npmrc')),
    originalNpmrc,
  );
  assert.equal(
    fs.existsSync(path.join(installDirectory, 'pnpm-lock.yaml')),
    false,
  );
});

test('falls back to npm when pnpm is unavailable for a workspace', (t) => {
  const fixture = createFixture(t, {
    packageJson: {
      name: 'theme-workspace',
      private: true,
      devDependencies: { '@example/theme': 'workspace:*' },
    },
    files: { 'pnpm-workspace.yaml': 'packages:\n  - packages/*\n' },
    managers: ['npm'],
  });
  const originalPackageJson = fs.readFileSync(
    path.join(fixture.repository, 'package.json'),
  );

  const result = runInstall(fixture, '3.59.0');

  assert.equal(result.status, 0, result.stderr);
  const executable = lastLine(result.stdout);
  const installDirectory = path.resolve(executable, '../../..');
  assert.ok(installDirectory.startsWith(fixture.runnerTemp));
  assert.deepEqual(readCommands(fixture), [
    `npm install --prefix ${installDirectory} --no-package-lock --no-save @shopify/cli@3.59.0`,
  ]);
  assert.deepEqual(
    fs.readFileSync(path.join(fixture.repository, 'package.json')),
    originalPackageJson,
  );
});

test('prefers an explicit non-pnpm packageManager over a pnpm lockfile', (t) => {
  const fixture = createFixture(t, {
    packageJson: { name: 'theme', packageManager: 'npm@10.0.0' },
    files: { 'pnpm-lock.yaml': 'lockfileVersion: 9.0\n' },
    managers: ['npm', 'pnpm'],
  });

  const result = runInstall(fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    lastLine(result.stdout),
    path.join(
      fs.realpathSync(fixture.repository),
      'node_modules',
      '.bin',
      'shopify',
    ),
  );
  assert.deepEqual(readCommands(fixture), [
    'npm install --no-package-lock --no-save @shopify/cli',
  ]);
});

test('does not fall back when pnpm is installed but its install fails', (t) => {
  const fixture = createFixture(t, {
    packageJson: { name: 'theme', packageManager: 'pnpm@10.0.0' },
    managers: ['npm', 'pnpm'],
    failPnpmInstall: true,
  });

  const result = runInstall(fixture);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /failed to run pnpm/i);
  const commands = readCommands(fixture);
  assert.equal(commands[0], 'pnpm --version');
  assert.ok(commands[1].startsWith('pnpm add --dir '));
  assert.ok(commands[1].endsWith('--no-lockfile @shopify/cli'));
  assert.equal(commands.some((command) => command.startsWith('npm ')), false);
});

function createFixture(
  t,
  { packageJson, files = {}, managers, failPnpmInstall = false },
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-check-install-cli-'));
  const repository = path.join(root, 'repo');
  const runnerTemp = path.join(root, 'runner-temp');
  const bin = path.join(root, 'bin');
  const commandLog = path.join(root, 'commands.log');
  fs.mkdirSync(repository);
  fs.mkdirSync(runnerTemp);
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(repository, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(repository, '.npmrc'),
    'registry=https://registry.example.invalid/\n',
  );
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(repository, name), contents);
  }
  for (const manager of managers) {
    writeExecutable(
      path.join(bin, manager),
      [
        '#!/bin/sh',
        `printf '%s %s\\n' '${manager}' "$*" >> "$COMMAND_LOG"`,
        'if [ "$1" = "--version" ]; then',
        '  printf "10.0.0\\n"',
        '  exit 0',
        'fi',
        ...(manager === 'pnpm' && failPnpmInstall
          ? ['echo "Failed to run pnpm" >&2', 'exit 1']
          : []),
        'exit 0',
      ].join('\n'),
    );
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  return {
    bin,
    commandLog,
    repository,
    runnerTemp,
  };
}

function writeExecutable(file, contents) {
  fs.writeFileSync(file, `${contents}\n`);
  fs.chmodSync(file, 0o755);
}

function runInstall(fixture, version) {
  const args = [
    '--require',
    tsNodeRegister,
    runStep,
    'installCli',
    ...(version ? [version] : []),
  ];
  const env = {
    ...process.env,
    COMMAND_LOG: fixture.commandLog,
    PATH: [fixture.bin, '/usr/bin', '/bin'].join(path.delimiter),
    RUNNER_TEMP: fixture.runnerTemp,
  };
  return spawnSync(process.execPath, args, {
    cwd: fixture.repository,
    encoding: 'utf8',
    env,
  });
}

function lastLine(output) {
  return output.trim().split('\n').pop();
}

function readCommands(fixture) {
  return fs
    .readFileSync(fixture.commandLog, 'utf8')
    .trim()
    .split('\n');
}
