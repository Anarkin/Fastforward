import { fs } from '../../../lib/main/files';
import * as path from 'node:path';

const internalEntries = new Set([
  'FETCH_HEAD',
  'objects',
  'logs',
  'lfs',
  'fsmonitor--daemon',
  'fsmonitor--daemon.ipc',
]);

const stashLog = /^logs[\\/]refs[\\/]stash$/;

type IsGitDir = (inGitDir: string) => boolean;

export function isInternal(inGitDir: string, isGitDir: IsGitDir): boolean {
  return (
    (!stashLog.test(inGitDir) &&
      isInternalIn([], inGitDir.split(/[\\/]/), isGitDir)) ||
    inGitDir.endsWith('.lock') ||
    inGitDir === ''
  );
}

function isInternalIn(
  gitDir: readonly string[],
  inside: readonly string[],
  isGitDir: IsGitDir,
): boolean {
  const [first] = inside;
  if (internalEntries.has(first)) {
    return true;
  }
  if (first !== 'modules') {
    return false;
  }
  for (let end = 2; end < inside.length; end++) {
    const moduleDir = [...gitDir, ...inside.slice(0, end)];
    if (isGitDir(moduleDir.join('/'))) {
      return isInternalIn(moduleDir, inside.slice(end), isGitDir);
    }
  }
  return false;
}

export function nestedGitDir(
  root: string,
  file: string,
): { readonly gitDir: string; readonly inside: string } | undefined {
  const parts = path.relative(root, file).split(path.sep);
  const at = parts.indexOf('.git');
  return at === -1 || at === parts.length - 1
    ? undefined
    : {
        gitDir: path.join(root, ...parts.slice(0, at + 1)),
        inside: parts.slice(at + 1).join(path.sep),
      };
}

export function leftAloneInGitDir(
  root: string,
  folder: string,
  isGitDir: (gitDir: string) => IsGitDir = isGitDirIn,
): boolean {
  if (path.relative(root, folder) === '.git') {
    return true;
  }
  const nested = nestedGitDir(root, folder);
  return (
    nested !== undefined &&
    (path.relative(root, nested.gitDir) === '.git' ||
      !watchedFolder(nested.inside, false, isGitDir(nested.gitDir)))
  );
}

export function isGitDirIn(gitDir: string): IsGitDir {
  return (inGitDir) => {
    try {
      return (
        fs
          .statSync(path.join(gitDir, inGitDir, 'HEAD'), {
            throwIfNoEntry: false,
          })
          ?.isFile() === true
      );
    } catch {
      return false;
    }
  };
}

const perWorktreeRefs = new Set(['bisect', 'worktree', 'rewritten']);

export function affectsWorktree(
  inGitDir: string,
  shared: boolean,
  isGitDir: IsGitDir,
): boolean {
  if (isInternal(inGitDir, isGitDir)) {
    return false;
  }
  const [first, second] = inGitDir.split(/[\\/]/);
  if (first === 'worktrees') {
    return false;
  }
  return (
    !shared ||
    (first === 'refs' && !perWorktreeRefs.has(second ?? '')) ||
    stashLog.test(inGitDir) ||
    first === 'packed-refs' ||
    first === 'reftable' ||
    first === 'config' ||
    first === 'shallow' ||
    first === 'info'
  );
}

export function changesRefsAlone(inGitDir: string): boolean {
  const [first, kind, ...rest] = inGitDir.split(/[\\/]/);
  return (
    first === 'refs' &&
    (kind === 'remotes' || kind === 'tags') &&
    rest.length > 0
  );
}

export function affectsWorktreeList(inGitDir: string): boolean {
  const [first, name, entry, ...rest] = inGitDir.split(/[\\/]/);
  if (first === 'HEAD') {
    return name === undefined;
  }
  if (first === 'reftable') {
    return name === 'tables.list' && entry === undefined;
  }
  return (
    first === 'worktrees' &&
    (entry === undefined ||
      ((entry === 'HEAD' || entry === 'gitdir') && rest.length === 0) ||
      (entry === 'reftable' && ['', 'tables.list'].includes(rest.join('/'))))
  );
}

const stashLogFolders = /^logs([\\/]refs)?$/;

export function watchedFolder(
  inGitDir: string,
  shared: boolean,
  isGitDir: IsGitDir,
): boolean {
  return (
    affectsWorktree(inGitDir, shared, isGitDir) ||
    affectsWorktreeList(inGitDir) ||
    stashLogFolders.test(inGitDir)
  );
}
