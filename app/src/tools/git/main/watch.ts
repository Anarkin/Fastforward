import { startWatchingTree } from '../../../lib/main/watch';
import { fs } from '../../../lib/main/files';
import * as path from 'node:path';
import { InFlight } from '../../../lib/main/inFlight';
import { forgetMonitor } from './fsMonitor';
import {
  affectsWorktree,
  affectsWorktreeList,
  changesRefsAlone,
  isGitDirIn,
  isInternal,
  leftAloneInGitDir,
  nestedGitDir,
  watchedFolder,
} from './gitDirPaths';
import { Ignored, ignoredPaths, NotIgnored } from './ignoredFiles';
import { isInside } from './insideFolder';
import { runGit } from './run';

import {
  Watcher,
  watchEach,
  TreeWatcher,
  watchTree,
  watchOneFolder,
} from './watchFolders';

export interface Changed {
  readonly refs: boolean;
  readonly workingTree: boolean;
}

interface WatchOptions {
  readonly delay: number;
  readonly maxDelay: number;
  readonly gitDirDelay?: number;
  readonly onChange: (change: Changed) => void;
  readonly onWorktreesChange?: () => void;
  readonly onError: (error: unknown) => void;
  readonly onStopped?: (error: unknown) => void;
  readonly recursive?: boolean;
  readonly ignored?: Ignored;
  readonly signal?: AbortSignal;
}

export function watchesRecursively(platform = process.platform): boolean {
  return platform !== 'linux';
}

export function isWatchFailure(error: unknown): boolean {
  return (
    error instanceof Error && 'syscall' in error && error.syscall === 'watch'
  );
}

export async function watchRepository(
  gitPath: string,
  root: string,
  {
    delay,
    maxDelay,
    gitDirDelay = delay,
    onChange,
    onWorktreesChange,
    onError,
    onStopped: onFirstStop = onError,
    recursive = watchesRecursively(),
    ignored = (repo, paths) => ignoredPaths(gitPath, repo, paths),
    signal,
  }: WatchOptions,
): Promise<Watcher> {
  const [gitDir, commonDir] = (
    await runGit(gitPath, root, ['rev-parse', '--git-dir', '--git-common-dir'])
  )
    .trim()
    .split('\n')
    .map((dir) => path.resolve(root, dir.trim()));
  const gitDirs = [...new Set([gitDir, commonDir])];

  let disposed = false;
  let stopTold = false;
  const onStopped = (error: unknown) => {
    (stopTold ? onError : onFirstStop)(error);
    stopTold = true;
  };
  const inFlight = new InFlight();
  let timer: NodeJS.Timeout | undefined;
  let worktreesTimer: NodeJS.Timeout | undefined;
  let pending: PendingChanges = {};
  const changedFiles = new Set<string>();
  const renamedFiles = new Set<string>();
  let workTreeLost = false;
  const notIgnored = new NotIgnored();

  const flush = async (withGitDir: boolean) => {
    timer = undefined;
    const files = [...changedFiles];
    const renamed = new Set(renamedFiles);
    const lost = workTreeLost;
    changedFiles.clear();
    renamedFiles.clear();
    workTreeLost = false;
    const refsAlone = withGitDir && pending.refsAlone === true;
    pending =
      withGitDir || pending.lastGitDir === undefined
        ? {}
        : { lastGitDir: pending.lastGitDir, refsAlone: pending.refsAlone };
    schedule();
    try {
      const workingTree =
        (withGitDir && !refsAlone) ||
        lost ||
        (await notIgnored.any(ignored, root, files, renamed));
      if ((withGitDir || workingTree) && !disposed) {
        onChange({ refs: withGitDir, workingTree });
      }
    } catch (error) {
      if (!disposed) {
        onError(error);
      }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    const next = nextFlush(pending, delay, maxDelay, gitDirDelay);
    timer =
      next &&
      setTimeout(
        () => void inFlight.track(flush(next.gitDir)),
        Math.max(0, next.at - Date.now()),
      );
  };
  const changedGitDir = (refsAlone = false) => {
    notIgnored.forget();
    pending = gitDirChanged(pending, Date.now(), refsAlone);
    schedule();
  };
  const worktreesChanged = () => {
    clearTimeout(worktreesTimer);
    worktreesTimer = setTimeout(() => {
      if (!disposed) {
        onWorktreesChange?.();
      }
    }, delay);
  };
  const inWorktreeInsideGitDir = (dir: string, file: string) =>
    isInside(root, file) && !isInside(root, dir);
  const gitDirHolding = (file: string) =>
    gitDirs.find(
      (dir) => isInside(dir, file) && !inWorktreeInsideGitDir(dir, file),
    );
  const changed = (file: string, event: string) => {
    const inGitDir = gitDirHolding(file);
    if (inGitDir !== undefined) {
      const inside = path.relative(inGitDir, file);
      const affects = affectsWorktree(
        inside,
        inGitDir === commonDir && commonDir !== gitDir,
        isGitDirIn(inGitDir),
      );
      const listed = affectsWorktreeList(inside);
      if ((!affects && !listed) || isFolderChangedForItsEntries(event, file)) {
        return;
      }
      if (affects) {
        changedGitDir(changesRefsAlone(inside));
        if (/^info(?:[\\/]exclude)?$/.test(inside)) {
          rootTree?.ignoresChanged(root);
        }
        if (/^config(?:\.worktree)?$/.test(inside)) {
          forgetMonitor(root);
        }
      }
      if (listed) {
        worktreesChanged();
      }
    } else if (isInside(root, file)) {
      const nested = nestedGitDir(root, file);
      if (
        nested !== undefined &&
        isInternal(nested.inside, isGitDirIn(nested.gitDir))
      ) {
        return;
      }
      changedFiles.add(file);
      if (event === 'rename') {
        renamedFiles.add(file);
      }
      if (path.basename(file) === '.gitignore') {
        notIgnored.forget();
      }
      const now = Date.now();
      pending = {
        ...pending,
        firstWorkTree: pending.firstWorkTree ?? now,
        lastWorkTree: now,
      };
      schedule();
    }
  };

  const workTreeDropped = () => {
    workTreeLost = true;
    const now = Date.now();
    pending = {
      ...pending,
      firstWorkTree: pending.firstWorkTree ?? now,
      lastWorkTree: now,
    };
    schedule();
  };
  const onEvent = (folder: string, file: string | null, event: string) => {
    if (file) {
      changed(path.join(folder, file), event);
    } else {
      workTreeDropped();
    }
  };
  const onGitDirEvent = (
    folder: string,
    file: string | null,
    event: string,
  ) => {
    if (!file) {
      changedGitDir();
      worktreesChanged();
    } else if (gitDirHolding(path.join(folder, file)) !== undefined) {
      changed(path.join(folder, file), event);
    }
  };
  let watchers: Watcher[];
  let rootTree: TreeWatcher | undefined;
  if (recursive) {
    watchers = watchEach([root, ...gitDirs], (folder) => {
      const watcher = startWatchingTree(folder, (event, file) => {
        const gone = file !== null && path.isAbsolute(file);
        if (gone) {
          watcher.close();
        }
        (folder === root ? onEvent : onGitDirEvent)(
          folder,
          gone ? null : file,
          event,
        );
      });
      watcher.on('error', (error) => {
        if (!disposed) {
          onStopped(error);
        }
      });
      return watcher;
    });
  } else {
    const trees = await Promise.all([
      watchTree(root, {
        skip: (folder) =>
          gitDirHolding(folder) !== undefined ||
          leftAloneInGitDir(root, folder),
        ignored,
        onEvent,
        onError,
        onStopped,
        signal,
        watch: watchOneFolder,
      }),
      ...gitDirs.map((gitDirTree) =>
        watchTree(gitDirTree, {
          skip: (folder) =>
            !watchedFolder(
              path.relative(gitDirTree, folder),
              gitDirTree === commonDir && commonDir !== gitDir,
              isGitDirIn(gitDirTree),
            ),
          ignored: () => Promise.resolve([]),
          onEvent: onGitDirEvent,
          onError,
          onStopped,
          signal,
          watch: watchOneFolder,
        }),
      ),
    ]);
    [rootTree] = trees;
    watchers = trees;
  }

  return {
    dispose: async () => {
      disposed = true;
      forgetMonitor(root);
      clearTimeout(timer);
      clearTimeout(worktreesTimer);
      await Promise.all(watchers.map((watcher) => watcher.dispose()));
      await inFlight.settled();
    },
  };
}

interface PendingChanges {
  readonly firstWorkTree?: number;
  readonly lastWorkTree?: number;
  readonly lastGitDir?: number;
  readonly refsAlone?: boolean;
}

export function gitDirChanged(
  pending: PendingChanges,
  at: number,
  refsAlone: boolean,
): PendingChanges {
  return {
    ...pending,
    lastGitDir: at,
    refsAlone:
      refsAlone &&
      (pending.lastGitDir === undefined || pending.refsAlone === true),
  };
}

export function nextFlush(
  { firstWorkTree, lastWorkTree, lastGitDir }: PendingChanges,
  delay: number,
  maxDelay: number,
  gitDirDelay = delay,
): { readonly at: number; readonly gitDir: boolean } | undefined {
  const workTreeAt =
    firstWorkTree === undefined || lastWorkTree === undefined
      ? undefined
      : Math.min(lastWorkTree + delay, firstWorkTree + maxDelay);
  const gitDirAt =
    lastGitDir === undefined ? undefined : lastGitDir + gitDirDelay;
  if (
    gitDirAt !== undefined &&
    (workTreeAt === undefined || gitDirAt <= workTreeAt)
  ) {
    return { at: gitDirAt, gitDir: true };
  }
  return workTreeAt === undefined
    ? undefined
    : { at: workTreeAt, gitDir: false };
}

function isFolderChangedForItsEntries(event: string, file: string): boolean {
  if (event !== 'change') {
    return false;
  }
  try {
    return fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() === true;
  } catch {
    return false;
  }
}
