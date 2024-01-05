import * as core from '@actions/core';
import { installCli } from './steps/installCli';
import { runChecksJson } from './steps/runChecksJson';
import { runChecksText } from './steps/runChecksText';
import { getConfigContents } from './steps/getConfigContents';
import { getFileDiff } from './steps/getFileDiff';
import { addAnnotations } from './addAnnotations';

async function run() {
  const cwd = process.cwd();
  const shopifyExecutable = `${cwd}/node_modules/.bin/shopify`;

  // This is mockable with process.env.INPUT_ALL_CAPS_NAME
  const themeRoot = core.getInput('theme_root') || cwd;
  const version = core.getInput('version') || '';
  const flags = core.getInput('flags') || '';
  const ghToken = core.getInput('token');
  const base = core.getInput('base');

  try {
    await installCli(version);
    if (ghToken) {
      const [{ report, exitCode }, configContent, fileDiff] =
        await Promise.all([
          runChecksJson(themeRoot, shopifyExecutable, true, flags),
          getConfigContents(themeRoot, shopifyExecutable, true),
          getFileDiff(base, cwd),
        ]);
      await addAnnotations(report, exitCode, configContent, ghToken, fileDiff);
      process.exit(exitCode);
    } else {
      const { exitCode } = await runChecksText(
        themeRoot,
        shopifyExecutable,
        true,
        flags,
      );
      process.exit(exitCode);
    }
  } catch (e) {
    console.error(e.stack); // tslint:disable-line
    core.setFailed(e.message);
  }
}

run();
