import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileChange } from '../shared/protocol';
import { runGit, splitNul } from './run';

export const diffArgs = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--histogram',
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

export const changesArgs = ['--raw', '--numstat', '-z', '--no-abbrev'];

const compareArgs = ['diff', '-M', ...diffArgs];

export function showFiles(
  gitPath: string,
  cwd: string,
  hash: string,
  signal?: AbortSignal,
): Promise<FileChange[]> {
  return changedFiles(
    gitPath,
    cwd,
    [...showArgs, ...changesArgs, hash],
    signal,
  );
}

export function compareFiles(
  gitPath: string,
  cwd: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<FileChange[]> {
  return changedFiles(
    gitPath,
    cwd,
    [...compareArgs, ...changesArgs, from, to],
    signal,
  );
}

async function changedFiles(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  signal: AbortSignal | undefined,
): Promise<FileChange[]> {
  const changes = parseRawChanges(await runGit(gitPath, cwd, args, { signal }));
  return (await withBytes(gitPath, cwd, changes)).map(({ file }) => file);
}

interface RawChange {
  readonly raw: string;
  readonly file: FileChange;
}

export async function withBytes(
  gitPath: string,
  cwd: string,
  changes: readonly RawChange[],
  workTree?: string,
  reverse = false,
): Promise<RawChange[]> {
  const sides = changes.map(({ raw, file }) => {
    const [, , oldId, newId] = raw.slice(1).split(' ');
    return file.insertions + file.deletions === 0 ? [] : [oldId, newId];
  });
  const ids = [...new Set(sides.flat().filter((id) => !isNullId(id)))];
  const sizes = new Map<string, number>();
  if (ids.length > 0) {
    const checked = await runGit(gitPath, cwd, ['cat-file', '--batch-check'], {
      input: ids.map((id) => `${id}\n`).join(''),
    });
    for (const line of checked.split('\n')) {
      const [id, type, size] = line.split(' ');
      if (type === 'blob') {
        sizes.set(id, Number(size));
      }
    }
  }
  const workTreeSize = async (path: string) => {
    if (workTree === undefined) {
      return 0;
    }
    const stats = await lstat(join(workTree, path)).catch(() => undefined);
    return stats?.isFile() ? stats.size : 0;
  };
  return Promise.all(
    changes.map(async ({ raw, file }, index) => {
      const [oldId, newId] = sides[index];
      if (oldId === undefined || newId === undefined) {
        return { raw, file };
      }
      const [committed, workTreeId, path] = reverse
        ? [newId, oldId, file.oldPath ?? file.path]
        : [oldId, newId, file.path];
      const bytes =
        (sizes.get(committed) ?? 0) +
        (sizes.get(workTreeId) ?? (await workTreeSize(path)));
      return { raw, file: { ...file, bytes } };
    }),
  );
}

function isNullId(id: string): boolean {
  return /^0+$/.test(id);
}

export interface PatchScope {
  readonly path?: string;
  readonly oldPath?: string;
  readonly include?: readonly string[];
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

export function pathspecs({ path, oldPath, include }: PatchScope): string[] {
  if (path !== undefined) {
    return oldPath ? ['--', oldPath, path] : ['--', path];
  }
  return include ? ['--', ...include] : [];
}

export function showPatch(
  gitPath: string,
  cwd: string,
  hash: string,
  scope: PatchScope = {},
  signal?: AbortSignal,
): Promise<string> {
  return patchOf(gitPath, cwd, [...showArgs, '--patch'], [hash], scope, signal);
}

export function comparePatch(
  gitPath: string,
  cwd: string,
  from: string,
  to: string,
  scope: PatchScope = {},
  signal?: AbortSignal,
): Promise<string> {
  return patchOf(gitPath, cwd, compareArgs, [from, to], scope, signal);
}

function patchOf(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  revisions: readonly string[],
  scope: PatchScope,
  signal: AbortSignal | undefined,
): Promise<string> {
  if (scope.include?.length === 0) {
    return Promise.resolve('');
  }
  return runGit(
    gitPath,
    cwd,
    [...args, ...diffOptionArgs(scope), ...revisions, ...pathspecs(scope)],
    { signal },
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
