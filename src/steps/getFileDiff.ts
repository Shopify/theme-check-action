import { exec, getExecOutput } from '@actions/exec';

// run git fetch origin $INPUT_BASE
// run git diff --name-only --diff-filter=ACMRTUB origin/$INPUT_BASE > /tmp/diff.log
export async function getFileDiff(
  baseBranch: string | undefined,
  gitRoot: string,
): Promise<string[] | undefined> {
  if (!baseBranch) return undefined;

  await exec('git', ['fetch', 'origin', baseBranch], {
    cwd: gitRoot,
  });
  const { stdout } = await getExecOutput(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMRTUB', `origin/${baseBranch}`],
    {
      cwd: gitRoot,
      silent: true,
      ignoreReturnCode: true,
    },
  );

  return stdout.split('\n').filter(Boolean);
}
