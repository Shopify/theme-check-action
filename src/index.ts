import * as core from '@actions/core';
import { installCli } from './steps/installCli';
import { runChecksJson } from './steps/runChecksJson';
import { runChecksText } from './steps/runChecksText';
import { getConfigContents } from './steps/getConfigContents';
import { getFileDiff } from './steps/getFileDiff';
import { addAnnotations } from './addAnnotations';
import * as semver from 'semver';

async function run() {
  const cwd = process.cwd();
  const shopifyExecutable = `${cwd}/node_modules/.bin/shopify`;

  // This is mockable with process.env.INPUT_ALL_CAPS_NAME
  const themeRoot = core.getInput('theme_root') || cwd;
  const version = core.getInput('version') || '';
  const flags = core.getInput('flags') || '';
  const ghToken = core.getInput('token');
  const base = core.getInput('base');
  const devPreview = requiresDevPreview(version);

  try {
    await installCli(version);
    if (ghToken) {
      const [{ report }, configContent, fileDiff] =
        await Promise.all([
          runChecksJson(
            themeRoot,
            shopifyExecutable,
            devPreview,
            flags,
          ),
          getConfigContents(themeRoot, shopifyExecutable, devPreview),
          getFileDiff(base, cwd),
        ]);
      await addAnnotations(
        report,
        configContent,
        ghToken,
        fileDiff,
      );
      process.exit(0);
    } else {
      const { exitCode } = await runChecksText(
        themeRoot,
        shopifyExecutable,
        devPreview,
        flags,
      );
      process.exit(exitCode);
    }
  } catch (e) {
    console.error(e.stack); // tslint:disable-line
    core.setFailed(e.message);
  }
}

function requiresDevPreview(version: string) {
  return (
    !!version &&
    semver.gte(version, '3.50.0') &&
    semver.lt(version, '3.55.0')
  );
}

run();
