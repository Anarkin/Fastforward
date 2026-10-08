import * as fs from 'node:fs';
import * as path from 'node:path';
import { InFlight } from '../shared/inFlight';
import { isMissing } from './files';
import { runGit, splitNul } from './run';

export interface Watcher {
  dispose(): Promise<void>;
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

export function watchesRecursively(platform = process.platform): boolean {
  return platform !== 'linux';
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
    recursive = watchesRecursively(),
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
  const inFlight = new InFlight();
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
        () => void inFlight.track(flush(next.gitDir)),
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
        affectsWorktree(
          inside,
          inGitDir === commonDir && commonDir !== gitDir,
          isGitDirIn(inGitDir),
        )
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
          skip: (folder) =>
            !watchedFolder(
              path.relative(gitDirTree, folder),
              gitDirTree === commonDir && commonDir !== gitDir,
              isGitDirIn(gitDirTree),
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
    dispose: async () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(worktreesTimer);
      await Promise.all(watchers.map((watcher) => watcher.dispose()));
      await inFlight.settled();
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
  return watchers.map((watcher) => ({
    dispose: () => {
      watcher.close();
      return Promise.resolve();
    },
  }));
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
  gone: boolean;
}

export async function watchTree(
  root: string,
  { skip, ignored, onEvent, onError, watch }: TreeOptions,
): Promise<Watcher> {
  const watched = new Map<string, WatchedFolder>();
  let disposed = false;
  const inFlight = new InFlight();
  let reported = false;
  const report = (error: unknown) => {
    if (!isMissing(error) && !reported && !disposed) {
      reported = true;
      onError(error);
    }
  };

  const ignoredFolders = new Map<string, Folder>();
  const ignoresChanged = (folder: string) => {
    const under = [...ignoredFolders.values()].filter((skipped) =>
      isInside(folder, skipped.path),
    );
    for (const skipped of under) {
      ignoredFolders.delete(skipped.path);
    }
    if (under.length > 0) {
      void inFlight.track(add(under));
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
          for (const folder of inRepo) {
            if (skipped.has(folder.path)) {
              ignoredFolders.set(folder.path, folder);
            }
          }
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
        if (file === '.gitignore') {
          ignoresChanged(folder.path);
        }
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
    // An entry named like the folder is told the way the folder's own removal
    // is, and the root has no parent to watch it again
    if (file === root) {
      return isFolder ? [{ path: root, repo: root }] : [];
    }
    const parent = watched.get(path.dirname(file));
    return parent !== undefined &&
      isFolder &&
      path.basename(file) !== '.git' &&
      !skip(file)
      ? [{ path: file, repo: parent.repo }]
      : [];
  };

  let renames = new Set<string>();
  const renamed = (file: string) => {
    if (renames.size === 0) {
      setImmediate(() => {
        const files = [...renames];
        renames = new Set();
        void inFlight.track(
          Promise.all(files.map(created)).then((folders) =>
            add(folders.flat()),
          ),
        );
      });
    }
    renames.add(file);
  };

  await add([{ path: root, repo: root }]);

  return {
    dispose: async () => {
      disposed = true;
      for (const { watcher } of watched.values()) {
        watcher.close();
      }
      watched.clear();
      await inFlight.settled();
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

const internalEntries = new Set([
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

// Git refuses to put a submodule's git folder inside another's, so the first
// git folder on the path is the submodule's, however its name looks
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

function isGitDirIn(gitDir: string): IsGitDir {
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
    first === 'config'
  );
}

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
