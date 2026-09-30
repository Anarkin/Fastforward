import type { FileChange } from '../shared/protocol';
import { runGit, splitNul } from './run';

export const diffArgs = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];

const showArgs = [
  'show',
  '--diff-merges=first-parent',
  '--format=',
  '-M',
  ...diffArgs,
];

export const changesArgs = ['--raw', '--numstat', '-z'];

export async function showFiles(
  gitPath: string,
  cwd: string,
  hash: string,
): Promise<FileChange[]> {
  return parseChanges(
    await runGit(gitPath, cwd, [...showArgs, ...changesArgs, hash]),
  );
}

export interface PatchScope {
  readonly path?: string;
  readonly oldPath?: string;
  readonly exclude?: readonly string[];
}

export function pathspecs({ path, oldPath, exclude = [] }: PatchScope): {
  args: string[];
  magic: boolean;
} {
  if (path !== undefined) {
    return {
      args: oldPath ? ['--', oldPath, path] : ['--', path],
      magic: false,
    };
  }
  return exclude.length > 0
    ? {
        args: [
          '--',
          '.',
          ...exclude.map((file) => `:(exclude,literal)${file}`),
        ],
        magic: true,
      }
    : { args: [], magic: false };
}

export function showPatch(
  gitPath: string,
  cwd: string,
  hash: string,
  scope: PatchScope = {},
): Promise<string> {
  const spec = pathspecs(scope);
  return runGit(gitPath, cwd, [...showArgs, '--patch', hash, ...spec.args], {
    pathspecMagic: spec.magic,
  });
}

const simpleStatuses = ['A', 'M', 'D', 'T'] as const;

export function parseChanges(output: string): FileChange[] {
  const tokens = splitNul(output);
  const files: FileChange[] = [];
  const stats = new Map<string, { insertions: number; deletions: number }>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith(':')) {
      const code = token.slice(token.lastIndexOf(' ') + 1)[0];
      if (code === 'R' || code === 'C') {
        files.push({
          status: code,
          oldPath: tokens[i + 1],
          path: tokens[i + 2],
          insertions: 0,
          deletions: 0,
        });
        i += 2;
      } else {
        files.push({
          status: simpleStatuses.find((known) => known === code) ?? '?',
          oldPath: undefined,
          path: tokens[i + 1],
          insertions: 0,
          deletions: 0,
        });
        i += 1;
      }
      continue;
    }
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(token);
    if (!match) {
      continue;
    }
    let path = match[3];
    if (path === '') {
      path = tokens[i + 2];
      i += 2;
    }
    stats.set(path, {
      insertions: Number(match[1]) || 0,
      deletions: Number(match[2]) || 0,
    });
  }
  return files.map((file) => ({ ...file, ...stats.get(file.path) }));
}
