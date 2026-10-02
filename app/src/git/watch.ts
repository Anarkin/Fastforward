import * as fs from 'node:fs';
import * as path from 'node:path';
import { runGit, splitNul } from './run';

export interface Watcher {
  dispose(): void;
}

interface WatchOptions {
  readonly delay: number;
  readonly maxDelay: number;
  readonly onChange: (gitDirChanged: boolean) => void;
  readonly onError: (error: unknown) => void;
}

export async function watchRepository(
  gitPath: string,
  root: string,
  { delay, maxDelay, onChange, onError }: WatchOptions,
): Promise<Watcher> {
  const [gitDir, commonDir] = (
    await runGit(gitPath, root, ['rev-parse', '--git-dir', '--git-common-dir'])
  )
    .trim()
    .split('\n')
    .map((dir) => path.resolve(root, dir.trim()));
  const gitDirs = [...new Set([gitDir, commonDir])];

  let disposed = false;
  let timer: NodeJS.Timeout | undefined;
  let pending: PendingChanges = {};
  const changedFiles = new Set<string>();

  const flush = async (withGitDir: boolean) => {
    timer = undefined;
    const files = [...changedFiles];
    changedFiles.clear();
    pending =
      withGitDir || pending.lastGitDir === undefined
        ? {}
        : { lastGitDir: pending.lastGitDir };
    schedule();
    try {
      if (
        !disposed &&
        (withGitDir || (await anyNotIgnored(gitPath, root, files)))
      ) {
        onChange(withGitDir);
      }
    } catch (error) {
      if (!disposed) {
        onError(error);
      }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    const next = nextFlush(pending, delay, maxDelay);
    timer =
      next &&
      setTimeout(
        () => void flush(next.gitDir),
        Math.max(0, next.at - Date.now()),
      );
  };
  const gitDirChanged = () => {
    pending = { ...pending, lastGitDir: Date.now() };
    schedule();
  };
  const changed = (file: string) => {
    const inGitDir = gitDirs.find((dir) => isInside(dir, file));
    if (inGitDir !== undefined) {
      if (
        affectsWorktree(
          path.relative(inGitDir, file),
          inGitDir === commonDir && commonDir !== gitDir,
        )
      ) {
        gitDirChanged();
      }
    } else if (isInside(root, file)) {
      changedFiles.add(path.relative(root, file).split(path.sep).join('/'));
      const now = Date.now();
      pending = {
        ...pending,
        firstWorkTree: pending.firstWorkTree ?? now,
        lastWorkTree: now,
      };
      schedule();
    }
  };

  const folders = [root, ...gitDirs.filter((dir) => !isInside(root, dir))];
  const watchers = folders.map((folder) => {
    const watcher = fs.watch(folder, { recursive: true }, (_event, file) => {
      if (file) {
        changed(path.join(folder, file));
      } else {
        gitDirChanged();
      }
    });
    watcher.on('error', onError);
    return watcher;
  });

  return {
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}

interface PendingChanges {
  readonly firstWorkTree?: number;
  readonly lastWorkTree?: number;
  readonly lastGitDir?: number;
}

export function nextFlush(
  { firstWorkTree, lastWorkTree, lastGitDir }: PendingChanges,
  delay: number,
  maxDelay: number,
): { readonly at: number; readonly gitDir: boolean } | undefined {
  const workTreeAt =
    firstWorkTree === undefined || lastWorkTree === undefined
      ? undefined
      : Math.min(lastWorkTree + delay, firstWorkTree + maxDelay);
  const gitDirAt = lastGitDir === undefined ? undefined : lastGitDir + delay;
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

function isInside(folder: string, file: string): boolean {
  const relative = path.relative(folder, file);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

export function isInternal(inGitDir: string): boolean {
  const [first] = inGitDir.split(/[\\/]/);
  return (
    first === 'objects' ||
    first === 'logs' ||
    inGitDir.endsWith('.lock') ||
    inGitDir === ''
  );
}

const perWorktreeRefs = new Set(['bisect', 'worktree', 'rewritten']);

export function affectsWorktree(inGitDir: string, shared: boolean): boolean {
  if (isInternal(inGitDir)) {
    return false;
  }
  const [first, second] = inGitDir.split(/[\\/]/);
  if (first === 'worktrees') {
    return false;
  }
  return (
    !shared ||
    (first === 'refs' && !perWorktreeRefs.has(second ?? '')) ||
    first === 'packed-refs' ||
    first === 'config'
  );
}

async function anyNotIgnored(
  gitPath: string,
  root: string,
  files: readonly string[],
): Promise<boolean> {
  if (files.length === 0) {
    return false;
  }
  let output: string;
  try {
    output = await runGit(gitPath, root, ['check-ignore', '-z', '--stdin'], {
      input: files.map((file) => `${file}\0`).join(''),
      okExitCodes: [0, 1],
      pathspecMagic: true,
    });
  } catch {
    return true;
  }
  const ignored = new Set(splitNul(output).filter(Boolean));
  return files.some((file) => !ignored.has(file));
}
