import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileChange } from '../shared/protocol';
import { blobSizes } from './files';
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

export interface RawChange {
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldId: string;
  readonly newId: string;
  readonly file: FileChange;
}

export async function withBytes(
  gitPath: string,
  cwd: string,
  changes: readonly RawChange[],
  { fromDisk = false, reverse = false } = {},
): Promise<RawChange[]> {
  const counted = ({ file }: RawChange) => file.insertions + file.deletions > 0;
  const sizes = await blobSizes(gitPath, cwd, [
    ...new Set(
      changes
        .filter(counted)
        .flatMap(({ oldId, newId }) => [oldId, newId])
        .filter((id) => !isNullId(id)),
    ),
  ]);
  const sizeOnDisk = async (path: string) => {
    if (!fromDisk) {
      return 0;
    }
    const stats = await lstat(join(cwd, path)).catch(() => undefined);
    return stats?.isFile() ? stats.size : 0;
  };
  return Promise.all(
    changes.map(async (change) => {
      if (!counted(change)) {
        return change;
      }
      const { oldId, newId, file } = change;
      const [oldSide, newSide, path] = reverse
        ? [newId, oldId, file.oldPath ?? file.path]
        : [oldId, newId, file.path];
      const bytes =
        (sizes.get(oldSide) ?? 0) +
        (sizes.get(newSide) ?? (await sizeOnDisk(path)));
      return { ...change, file: { ...file, bytes } };
    }),
  );
}

export function isNullId(id: string): boolean {
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

export function parseChanges(output: string): FileChange[] {
  return parseRawChanges(output).map(({ file }) => file);
}

export function parseRawChanges(output: string): RawChange[] {
  const tokens = splitNul(output);
  const files: RawChange[] = [];
  const stats = new Map<string, { insertions: number; deletions: number }>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith(':')) {
      const [oldMode = '', newMode = '', oldId = '', newId = '', status = ''] =
        token.slice(1).split(' ');
      const sides = { oldMode, newMode, oldId, newId };
      const code = status[0] ?? '';
      if (code === 'R' || code === 'C') {
        files.push({
          ...sides,
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
          ...sides,
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
  return files.map((change) => ({
    ...change,
    file: { ...change.file, ...stats.get(change.file.path) },
  }));
}
