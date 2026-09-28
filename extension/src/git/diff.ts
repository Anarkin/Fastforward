import type { FileChange } from '../shared/protocol';
import { runGit, splitNul } from './run';

// Diffs in the format the parsers expect, whatever the user's config says:
// no colors, external diff tools or text conversion, and a/ and b/ prefixes
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

// Each changed file's status and paths, and its changed lines, in one diff
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

// What part of a diff to fetch: one file, limited to both its paths when it
// was renamed, as git only detects the rename when it sees both, or every
// file except some
export interface PatchScope {
  readonly path?: string;
  readonly oldPath?: string;
  readonly exclude?: readonly string[];
}

export function pathspecs({
  path,
  oldPath,
  exclude = [],
}: PatchScope): string[] {
  if (path !== undefined) {
    return oldPath ? ['--', oldPath, path] : ['--', path];
  }
  return exclude.length > 0
    ? ['--', '.', ...exclude.map((file) => `:(exclude,literal)${file}`)]
    : [];
}

export function showPatch(
  gitPath: string,
  cwd: string,
  hash: string,
  scope: PatchScope = {},
): Promise<string> {
  return runGit(
    gitPath,
    cwd,
    [...showArgs, '--patch', hash, ...pathspecs(scope)],
    { pathspecMagic: (scope.exclude?.length ?? 0) > 0 },
  );
}

const simpleStatuses = ['A', 'M', 'D', 'T'] as const;

// The --raw lines first, ":<modes> <objects> M\0path\0", or
// ":<modes> <objects> R100\0old\0new\0" for renames and copies, then the
// --numstat ones, "ins\tdel\tpath\0", or "ins\tdel\t\0old\0new\0" for
// renames, with "-" for binary files
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
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(token);
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
