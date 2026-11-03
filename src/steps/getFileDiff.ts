import { exec, getExecOutput } from '@actions/exec';

export interface LineRange {
  start: number;
  end: number;
}

export interface FileDiff {
  files: string[];
  changedLines: Record<string, LineRange[]>;
}

export async function getFileDiff(
  baseBranch: string | undefined,
  gitRoot: string,
  includeChangedLines = false,
): Promise<FileDiff | undefined> {
  if (!baseBranch) return undefined;

  await exec('git', ['fetch', 'origin', baseBranch], {
    cwd: gitRoot,
  });
  if (!includeChangedLines) {
    const { stdout } = await getExecOutput(
      'git',
      [
        'diff',
        '--name-only',
        '--diff-filter=ACMRTUB',
        `origin/${baseBranch}`,
      ],
      {
        cwd: gitRoot,
        silent: true,
        ignoreReturnCode: true,
      },
    );

    return {
      files: stdout.split('\n').filter(Boolean),
      changedLines: {},
    };
  }

  const { stdout } = await getExecOutput(
    'git',
    [
      '-c',
      'core.quotePath=false',
      'diff',
      '--no-ext-diff',
      '--diff-filter=ACMRTUB',
      '--unified=0',
      `origin/${baseBranch}`,
      '--',
    ],
    {
      cwd: gitRoot,
      silent: true,
    },
  );

  return parseGitDiff(stdout);
}

export function parseGitDiff(output: string): FileDiff {
  const files = new Set<string>();
  const changedLines: Record<string, LineRange[]> = Object.create(null);
  let currentFile: string | undefined;
  let inHunk = false;

  for (const line of output.split('\n')) {
    if (line.startsWith('diff --git ')) {
      currentFile = undefined;
      inHunk = false;
      continue;
    }

    if (!inHunk && line.startsWith('+++ ')) {
      currentFile = parseGitFilePath(line.slice('+++ '.length));
      if (!currentFile) continue;
      files.add(currentFile);
      if (!Object.prototype.hasOwnProperty.call(changedLines, currentFile)) {
        changedLines[currentFile] = [];
      }
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) continue;
    if (!currentFile) {
      throw new Error(
        'check_modified_lines could not identify a file in git diff.',
      );
    }

    inHunk = true;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count > 0) {
      changedLines[currentFile].push({ start, end: start + count - 1 });
    }
  }

  return { files: [...files], changedLines };
}

function parseGitFilePath(headerPath: string): string | undefined {
  // Git terminates unquoted paths containing spaces with a tab delimiter.
  const pathValue = headerPath.replace(/\r$/, '').replace(/\t$/, '');
  if (pathValue === '/dev/null') return undefined;
  if (!pathValue.startsWith('b/') || pathValue.includes('"')) {
    throw new Error(
      'check_modified_lines cannot safely parse a quoted path from git diff.',
    );
  }
  return pathValue.slice(2);
}
