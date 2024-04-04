import { exec } from '@actions/exec';
import * as semver from 'semver';

const MIN_VERSION = '3.50.0';

export async function installCli(version?: string) {
  const versionSuffix = version ? `@${version}` : '';

  if (!isValidVersion(version)) {
    throw new Error(
      `Shopify CLI version: ${version} is invalid or smaller than ${MIN_VERSION}`,
    );
  }

  await exec('npm', [
    'install',
    '--no-package-lock',
    '--no-save',
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
