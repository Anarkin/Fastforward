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
  readonly recursive?: boolean;
}

export async function watchRepository(
  gitPath: string,
  root: string,
  {
    delay,
    maxDelay,
    onChange,
    onError,
    recursive = process.platform !== 'linux',
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

  const onEvent = (folder: string, file: string | null) => {
    if (file) {
      changed(path.join(folder, file));
    } else {
      gitDirChanged();
    }
  };
  let watchers: Watcher[];
  if (recursive) {
    const folders = [root, ...gitDirs.filter((dir) => !isInside(root, dir))];
    watchers = watchEach(folders, (folder) => {
      const watcher = fs.watch(folder, { recursive: true }, (_event, file) =>
        onEvent(folder, file),
      );
      watcher.on('error', onError);
      return watcher;
    });
  } else {
    watchers = await Promise.all([
      watchTree(root, {
        skip: (folder) => gitDirs.some((dir) => isInside(dir, folder)),
        ignored: (repo, folders) => ignoredFolders(gitPath, repo, folders),
        onEvent,
        onError,
        watch: watchOneFolder,
      }),
      ...gitDirs.map((gitDirTree) =>
        watchTree(gitDirTree, {
          skip: (folder) =>
            !affectsWorktree(
              path.relative(gitDirTree, folder),
              gitDirTree === commonDir && commonDir !== gitDir,
            ),
          ignored: () => Promise.resolve([]),
          onEvent,
          onError,
          watch: watchOneFolder,
        }),
      ),
    ]);
  }

  return {
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
      for (const watcher of watchers) {
        watcher.dispose();
      }
    },
  };
}

export interface FolderWatcher {
  close(): void;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export function watchEach(
  folders: readonly string[],
  watch: (folder: string) => FolderWatcher,
): Watcher[] {
  const watchers: FolderWatcher[] = [];
  try {
    for (const folder of folders) {
      watchers.push(watch(folder));
    }
  } catch (error) {
    for (const watcher of watchers) {
      watcher.close();
    }
    throw error;
  }
  return watchers.map((watcher) => ({ dispose: () => watcher.close() }));
}

interface TreeOptions {
  readonly skip: (folder: string) => boolean;
  readonly ignored: (
    repo: string,
    folders: readonly string[],
  ) => Promise<readonly string[]>;
  readonly onEvent: (folder: string, file: string | null) => void;
  readonly onError: (error: unknown) => void;
  readonly watch: (
    folder: string,
    listener: (event: string, file: string | null) => void,
  ) => FolderWatcher;
}

interface Folder {
  readonly path: string;
  readonly repo: string;
}

// Node's recursive fs.watch on Linux walks the whole tree synchronously,
// ignored folders too, with one inotify watch per file
export async function watchTree(
  root: string,
  { skip, ignored, onEvent, onError, watch }: TreeOptions,
): Promise<Watcher> {
  const watched = new Map<string, { watcher: FolderWatcher; repo: string }>();
  let disposed = false;
  let reported = false;
  const report = (error: unknown) => {
    if (!isMissing(error) && !reported && !disposed) {
      reported = true;
      onError(error);
    }
  };

  const unwatch = (folder: string) => {
    for (const [watchedFolder, { watcher }] of watched) {
      if (isInside(folder, watchedFolder)) {
        watcher.close();
        watched.delete(watchedFolder);
      }
    }
  };

  const notIgnored = async (folders: readonly Folder[]): Promise<Folder[]> => {
    const byRepo = Map.groupBy(folders, (folder) => folder.repo);
    const kept = await Promise.all(
      [...byRepo].map(async ([repo, inRepo]) => {
        const asked = inRepo.filter((folder) => folder.path !== repo);
        try {
          const skipped = new Set(
            asked.length === 0
              ? []
              : await ignored(
                  repo,
                  asked.map((folder) => folder.path),
                ),
          );
          return inRepo.filter((folder) => !skipped.has(folder.path));
        } catch (error) {
          report(error);
          return inRepo.filter((folder) => folder.path === repo);
        }
      }),
    );
    return kept.flat();
  };

  const watchFolder = async (folder: Folder): Promise<Folder[]> => {
    if (disposed || watched.has(folder.path)) {
      return [];
    }
    let watcher: FolderWatcher;
    try {
      watcher = watch(folder.path, (event, file) => {
        onEvent(folder.path, file);
        if (file && event === 'rename') {
          void renamed(path.join(folder.path, file));
        }
      });
    } catch (error) {
      report(error);
      return [];
    }
    watcher.on('error', report);
    const entry = { watcher, repo: folder.repo };
    watched.set(folder.path, entry);
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(folder.path, { withFileTypes: true });
    } catch (error) {
      report(error);
      return [];
    }
    if (entries.some((child) => child.name === '.git')) {
      entry.repo = folder.path;
    }
    return entries
      .filter((child) => child.isDirectory() && child.name !== '.git')
      .map((child) => ({
        path: path.join(folder.path, child.name),
        repo: entry.repo,
      }))
      .filter((child) => !skip(child.path));
  };

  const add = async (folders: readonly Folder[]) => {
    let level = folders;
    while (level.length > 0) {
      if (disposed) {
        return;
      }
      const kept = await notIgnored(level);
      level = (await Promise.all(kept.map(watchFolder))).flat();
    }
  };

  const renamed = async (file: string) => {
    const parent = watched.get(path.dirname(file));
    if (watched.has(file)) {
      unwatch(file);
    }
    const stats = await fs.promises.lstat(file).catch(() => undefined);
    if (
      parent !== undefined &&
      stats?.isDirectory() === true &&
      path.basename(file) !== '.git' &&
      !skip(file)
    ) {
      await add([{ path: file, repo: parent.repo }]);
    }
  };

  await add([{ path: root, repo: root }]);

  return {
    dispose: () => {
      disposed = true;
      unwatch(root);
    },
  };
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

function watchOneFolder(
  folder: string,
  listener: (event: string, file: string | null) => void,
): FolderWatcher {
  return fs.watch(folder, listener);
}

export async function ignoredFolders(
  gitPath: string,
  repo: string,
  folders: readonly string[],
): Promise<string[]> {
  const relative = folders.map((folder) => {
    const inRepo = path.relative(repo, folder).split(path.sep).join('/');
    // check-ignore reads a path starting with ':' as pathspec magic
    return inRepo.startsWith(':') ? `./${inRepo}` : inRepo;
  });
  const output = await runGit(
    gitPath,
    repo,
    ['check-ignore', '-z', '--stdin'],
    {
      input: relative.map((folder) => `${folder}\0`).join(''),
      okExitCodes: [0, 1],
      pathspecMagic: true,
    },
  );
  const ignored = new Set(splitNul(output));
  return folders.filter((_folder, index) => ignored.has(relative[index]));
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

const internalFolders = new Set(['objects', 'logs', 'lfs']);

export function isInternal(inGitDir: string): boolean {
  const [first, , ...inModule] = inGitDir.split(/[\\/]/);
  return (
    internalFolders.has(first) ||
    (first === 'modules' &&
      inModule.some((folder) => internalFolders.has(folder))) ||
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
    first === 'reftable' ||
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
