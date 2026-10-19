import { exec, getExecOutput } from '@actions/exec';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';

const MIN_VERSION = '3.50.0';
const MAX_THEME_VERSION = '3.59.0';

export async function installCli(version?: string) {
  const versionSuffix = version ? `@${version}` : '';

  if (!isValidVersion(version)) {
    throw new Error(
      `Shopify CLI version: ${version} is invalid or smaller than ${MIN_VERSION}`,
    );
  }

  const packages = [
    `@shopify/cli${versionSuffix}`,
    ...(shouldIncludeTheme(version)
      ? [`@shopify/theme${versionSuffix}`]
      : []),
  ];
  const cwd = process.cwd();
  if (!isPnpmProject(cwd)) {
    await exec('npm', [
      'install',
      '--no-package-lock',
      '--no-save',
      ...packages,
    ]);
    return path.join(cwd, 'node_modules', '.bin', 'shopify');
  }

  const installDirectory = createTemporaryInstallDirectory();
  copyNpmConfig(cwd, installDirectory);

  if (await isPnpmAvailable()) {
    await exec('pnpm', [
      'add',
      '--dir',
      installDirectory,
      '--no-lockfile',
      ...packages,
    ]);
  } else {
    await exec('npm', [
      'install',
      '--prefix',
      installDirectory,
      '--no-package-lock',
      '--no-save',
      ...packages,
    ]);
  }

  return path.join(installDirectory, 'node_modules', '.bin', 'shopify');
}

function isPnpmProject(cwd: string) {
  const packageJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (typeof packageJson.packageManager === 'string') {
        return packageJson.packageManager.startsWith('pnpm@');
      }
    } catch (_error) {
      // Fall back to the pnpm workspace and lockfile markers.
    }
  }

  return (
    fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml')) ||
    fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))
  );
}

async function isPnpmAvailable() {
  try {
    const { exitCode } = await getExecOutput('pnpm', ['--version'], {
      ignoreReturnCode: true,
      silent: true,
    });
    return exitCode === 0;
  } catch (_error) {
    return false;
  }
}

function createTemporaryInstallDirectory() {
  const runnerTemp = process.env.RUNNER_TEMP || os.tmpdir();
  fs.mkdirSync(runnerTemp, { recursive: true });
  return fs.mkdtempSync(path.join(runnerTemp, 'theme-check-action-'));
}

function copyNpmConfig(cwd: string, installDirectory: string) {
  const npmConfigPath = path.join(cwd, '.npmrc');
  if (!fs.existsSync(npmConfigPath)) {
    return;
  }

  const temporaryNpmConfigPath = path.join(installDirectory, '.npmrc');
  fs.copyFileSync(npmConfigPath, temporaryNpmConfigPath);
  if (process.platform !== 'win32') {
    fs.chmodSync(temporaryNpmConfigPath, 0o600);
  }
}

function shouldIncludeTheme(version?: string) {
  if (!version || version.includes('experimental')) {
    return false;
  }

  if (!semver.valid(version)) {
    return false;
  }

  if (
    semver.gte(version, MIN_VERSION) &&
    semver.lt(version, MAX_THEME_VERSION)
  ) {
    return true;
  }

  return false;
}

function isValidVersion(version?: string): boolean {
  if (!version || version.includes('experimental')) {
    return true;
  }

  // Check if the version is valid
  if (!semver.valid(version)) {
    return false;
  }

  // Check if the version is greater than or equal to the minimum version
  if (!semver.gte(version, MIN_VERSION)) {
    return false;
  }

  return true;
}
