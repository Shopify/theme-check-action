import { promises as fs } from 'fs';
import { exec } from '@actions/exec';
import { detect } from 'detect-package-manager';
import * as semver from 'semver';

const MIN_VERSION = '3.50.0';

export async function installCli(version?: string) {
  const versionSuffix = version ? `@${version}` : '';

  if (!isValidVersion(version)) {
    throw new Error(
      `Shopify CLI version: ${version} is invalid or smaller than ${MIN_VERSION}`,
    );
  }

  let packageManager = await detect();
  try {
    console.log('Checking ' + packageManager)
    await fs.access(packageManager);
  } catch (e) {
    console.log('No access to ' + packageManager)
    packageManager = 'npm';
  }

  const args: string[] = []
  switch (packageManager) {
    case 'bun':
      args.push('add', '--no-save');
      break;

    case 'npm':
      args.push('install', '--no-package-lock');
      break;

    case 'pnpm':
      args.push('add', '--no-lockfile');
      break;

    case 'yarn':
      args.push('add', '--no-lockfile');
      break;
  }

  await exec(packageManager, [
    ...args,
    '@shopify/cli' + versionSuffix,
    '@shopify/theme' + versionSuffix,
  ]);
}

function isValidVersion(version?: string): boolean {
  if (!version) {
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
