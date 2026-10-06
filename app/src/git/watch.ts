import * as fs from 'node:fs';
import * as path from 'node:path';
import { isMissing } from './files';
import { runGit, splitNul } from './run';

export interface Watcher {
  dispose(): void;
}

type Ignored = (
  repo: string,
  paths: readonly string[],
) => Promise<readonly string[]>;

interface WatchOptions {
  readonly delay: number;
  readonly maxDelay: number;
  readonly onChange: (gitDirChanged: boolean) => void;
  readonly onWorktreesChange?: () => void;
  readonly onError: (error: unknown) => void;
  readonly recursive?: boolean;
  readonly ignored?: Ignored;
}

export async function watchRepository(
  gitPath: string,
  root: string,
  {
    delay,
    maxDelay,
    onChange,
    onWorktreesChange,
    onError,
    recursive = process.platform !== 'linux',
    ignored = (repo, paths) => ignoredPaths(gitPath, repo, paths),
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
  let worktreesTimer: NodeJS.Timeout | undefined;
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
      const notify = withGitDir || (await anyNotIgnored(ignored, root, files));
      if (notify && !disposed) {
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
  const worktreesChanged = () => {
    clearTimeout(worktreesTimer);
    worktreesTimer = setTimeout(() => {
      if (!disposed) {
        onWorktreesChange?.();
      }
    }, delay);
  };
  const changed = (file: string) => {
    const inGitDir = gitDirs.find((dir) => isInside(dir, file));
    if (inGitDir !== undefined) {
      const inside = path.relative(inGitDir, file);
      if (
        affectsWorktree(inside, inGitDir === commonDir && commonDir !== gitDir)
      ) {
        gitDirChanged();
      }
      if (affectsWorktreeList(inside)) {
        worktreesChanged();
      }
    } else if (isInside(root, file)) {
      changedFiles.add(file);
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
        ignored,
        onEvent,
        onError,
        watch: watchOneFolder,
      }),
      ...gitDirs.map((gitDirTree) =>
        watchTree(gitDirTree, {
          skip: (folder) => {
            const inside = path.relative(gitDirTree, folder);
            return (
              !affectsWorktree(
                inside,
                gitDirTree === commonDir && commonDir !== gitDir,
              ) && !affectsWorktreeList(inside)
            );
          },
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
      clearTimeout(worktreesTimer);
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
  readonly ignored: Ignored;
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

interface WatchedFolder {
  readonly watcher: FolderWatcher;
  repo: string;
  readonly children: Set<string>;
  // A watcher keeps watching a folder removed or moved away, so one created
  // in its place needs a watcher of its own
  gone: boolean;
}

// Node's recursive fs.watch on Linux walks the whole tree synchronously,
// ignored folders too, with one inotify watch per file
export async function watchTree(
  root: string,
  { skip, ignored, onEvent, onError, watch }: TreeOptions,
): Promise<Watcher> {
  const watched = new Map<string, WatchedFolder>();
  let disposed = false;
  let reported = false;
  const report = (error: unknown) => {
    if (!isMissing(error) && !reported && !disposed) {
      reported = true;
      onError(error);
    }
  };

  const unwatch = (folder: string) => {
    const entry = watched.get(folder);
    if (entry === undefined) {
      return;
    }
    watched.delete(folder);
    entry.watcher.close();
    watched.get(path.dirname(folder))?.children.delete(folder);
    for (const child of entry.children) {
      unwatch(child);
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
    const parent = watched.get(path.dirname(folder.path));
    if (
      disposed ||
      watched.has(folder.path) ||
      (folder.path !== root && parent === undefined)
    ) {
      return [];
    }
    let entry: WatchedFolder | undefined;
    try {
      const watcher = watch(folder.path, (event, file) => {
        onEvent(folder.path, file);
        if (file && event === 'rename') {
          if (entry && file === path.basename(folder.path)) {
            entry.gone = true;
            renamed(folder.path);
          }
          renamed(path.join(folder.path, file));
        }
      });
      entry = { watcher, repo: folder.repo, children: new Set(), gone: false };
    } catch (error) {
      report(error);
      return [];
    }
    entry.watcher.on('error', report);
    watched.set(folder.path, entry);
    parent?.children.add(folder.path);
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(folder.path, { withFileTypes: true });
    } catch (error) {
      report(error);
      return [];
    }
    if (watched.get(folder.path) !== entry) {
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

  const created = async (file: string): Promise<Folder[]> => {
    const stats = await fs.promises.lstat(file).catch(() => undefined);
    const isFolder = stats?.isDirectory() === true;
    const known = watched.get(file);
    if (known !== undefined) {
      if (isFolder && !known.gone) {
        return [];
      }
      unwatch(file);
    }
    const parent = watched.get(path.dirname(file));
    return parent !== undefined &&
      isFolder &&
      path.basename(file) !== '.git' &&
      !skip(file)
      ? [{ path: file, repo: parent.repo }]
      : [];
  };

  // Folders created together are checked together, as asking git costs a
  // process
  let renames = new Set<string>();
  const renamed = (file: string) => {
    if (renames.size === 0) {
      setImmediate(() => {
        const files = [...renames];
        renames = new Set();
        void Promise.all(files.map(created)).then((folders) =>
          add(folders.flat()),
        );
      });
    }
    renames.add(file);
  };

  await add([{ path: root, repo: root }]);

  return {
    dispose: () => {
      disposed = true;
      for (const { watcher } of watched.values()) {
        watcher.close();
      }
      watched.clear();
    },
  };
}

function watchOneFolder(
  folder: string,
  listener: (event: string, file: string | null) => void,
): FolderWatcher {
  return fs.watch(folder, listener);
}

export async function ignoredPaths(
  gitPath: string,
  repo: string,
  paths: readonly string[],
): Promise<string[]> {
  const relative = paths.map((file) => {
    const inRepo = path.relative(repo, file).split(path.sep).join('/');
    // check-ignore reads a path starting with ':' as pathspec magic
    return inRepo.startsWith(':') ? `./${inRepo}` : inRepo;
  });
  const output = await runGit(
    gitPath,
    repo,
    ['check-ignore', '-z', '--stdin'],
    {
      input: relative.map((file) => `${file}\0`).join(''),
      okExitCodes: [0, 1],
      pathspecMagic: true,
    },
  );
  const ignored = new Set(splitNul(output).filter(Boolean));
  return paths.filter((_file, index) => ignored.has(relative[index]));
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
    (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative))
  );
}

const internalFolders = new Set(['objects', 'logs', 'lfs']);

const gitDirEntries = new Set(['HEAD', 'index', 'config', 'refs', 'modules']);

export function isInternal(inGitDir: string): boolean {
  const [first, ...rest] = inGitDir.split(/[\\/]/);
  return (
    internalFolders.has(first) ||
    (first === 'modules' && isInternalInModule(rest)) ||
    inGitDir.endsWith('.lock') ||
    inGitDir === ''
  );
}

// A submodule's git dir is modules/ followed by its name, which can have
// several segments, so objects, logs or lfs is a folder of the git dir only
// when what follows can't begin a git dir; logs followed by HEAD or refs could
// be either, and is taken for a reflog
function isInternalInModule(segments: readonly string[]): boolean {
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    const next = segments[i + 1];
    if (segment === 'modules') {
      return isInternalInModule(segments.slice(i + 1));
    }
    if (gitDirEntries.has(segment)) {
      return false;
    }
    if (
      internalFolders.has(segment) &&
      next !== undefined &&
      (!gitDirEntries.has(next) ||
        (segment === 'logs' && (next === 'HEAD' || next === 'refs')))
    ) {
      return true;
    }
  }
  return false;
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

// The HEAD of each worktree names what it shows, and a folder in worktrees
// comes and goes with a worktree
export function affectsWorktreeList(inGitDir: string): boolean {
  const [first, name, entry, ...rest] = inGitDir.split(/[\\/]/);
  if (first === 'HEAD') {
    return name === undefined;
  }
  return (
    first === 'worktrees' &&
    (entry === undefined ||
      ((entry === 'HEAD' || entry === 'gitdir') && rest.length === 0))
  );
}

async function anyNotIgnored(
  ignored: Ignored,
  root: string,
  files: readonly string[],
): Promise<boolean> {
  if (files.length === 0) {
    return false;
  }
  let found: ReadonlySet<string>;
  try {
    found = new Set(await ignored(root, files));
  } catch {
    return true;
  }
  return files.some((file) => !found.has(file));
}
