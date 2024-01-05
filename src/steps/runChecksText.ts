import { getExecOutput } from '@actions/exec';

export async function runChecksText(
  root: string,
  shopifyExecutable: string = 'shopify',
  devPreview = true,
  flags = '',
) {
  const { exitCode } = await getExecOutput(
    shopifyExecutable,
    [
      'theme',
      'check',
      devPreview ? '--dev-preview' : undefined,
      ...flags.split(' '),
      ...['--path', root],
    ].filter((x): x is string => Boolean(x)),
    {
      ignoreReturnCode: true,
    },
  );

  return {
    exitCode,
  };
}
