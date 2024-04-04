import { exec } from '@actions/exec';

export async function setup(version?: string) {
  const versionSuffix = version ? `@${version}` : '';
  await exec('npm', [
    'install',
    '@shopify/cli' + versionSuffix,
    '@shopify/theme' + versionSuffix,
  ]);
}
