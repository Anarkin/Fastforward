import type { FileChange } from '../shared/protocol';
import { runGit, splitNul } from './run';

export const diffArgs = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--full-index',
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
  readonly entireFile?: boolean;
  readonly ignoreWhitespace?: boolean;
}

export function diffOptionArgs({
  entireFile,
  ignoreWhitespace,
}: PatchScope): string[] {
  return [
    ...(entireFile ? ['--unified=2147483647'] : []),
    ...(ignoreWhitespace ? ['--ignore-all-space'] : []),
  ];
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
  return runGit(
    gitPath,
    cwd,
    [...showArgs, '--patch', ...diffOptionArgs(scope), hash, ...spec.args],
    {
      pathspecMagic: spec.magic,
    },
  );
}

const simpleStatuses = ['A', 'M', 'D', 'T'] as const;

function rawStatus(token: string): string {
  return token.slice(token.lastIndexOf(' ') + 1)[0] ?? '';
}

export function parseChanges(output: string): FileChange[] {
  return parseRawChanges(output).map(({ file }) => file);
}

export function parseRawChanges(
  output: string,
): { readonly raw: string; readonly file: FileChange }[] {
  const tokens = splitNul(output);
  const files: { raw: string; file: FileChange }[] = [];
  const stats = new Map<string, { insertions: number; deletions: number }>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith(':')) {
      const code = rawStatus(token);
      if (code === 'R' || code === 'C') {
        files.push({
          raw: token,
          file: {
            status: code,
            oldPath: tokens[i + 1],
            path: tokens[i + 2],
            insertions: 0,
            deletions: 0,
          },
        });
        i += 2;
      } else {
        files.push({
          raw: token,
          file: {
            status: simpleStatuses.find((known) => known === code) ?? '?',
            oldPath: undefined,
            path: tokens[i + 1],
            insertions: 0,
            deletions: 0,
          },
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
  return files.map(({ raw, file }) => ({
    raw,
    file: { ...file, ...stats.get(file.path) },
  }));
}
