import { getExecOutput } from '@actions/exec';

export async function getConfigContents(
  root: string,
  shopifyExecutable: string = 'shopify',
  devPreview = true,
) {
  const { stdout } = await getExecOutput(
    shopifyExecutable,
    [
      'theme',
      'check',
      devPreview ? '--dev-preview' : undefined,
      ...['--output', 'json'],
      ...['--path', root],
      '--print',
    ].filter((x): x is string => Boolean(x)),
    {
      silent: true,
      ignoreReturnCode: true,
    },
  );

  return stdout;
}
