import * as fs from 'node:fs';
import * as path from 'node:path';
import { InFlight } from '../../../lib/main/inFlight';
import { isMissing } from './files';
import { runGit, splitNul } from './run';

export interface Watcher {
  dispose(): Promise<void>;
}

export type Ignored = (
  repo: string,
  paths: readonly string[],
) => Promise<readonly string[]>;

const exhaustion = new Set(['ENOSPC', 'EMFILE', 'ENFILE']);

function outOfWatches(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    exhaustion.has(error.code)
  );
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

export interface TreeOptions {
  readonly skip: (folder: string) => boolean;
  readonly ignored: Ignored;
  readonly onEvent: (
    folder: string,
    file: string | null,
    event: string,
  ) => void;
  readonly onError: (error: unknown) => void;
  readonly onStopped?: (error: unknown) => void;
  readonly signal?: AbortSignal;
  readonly watch: (
    folder: string,
    listener: (event: string, file: string | null) => void,
  ) => FolderWatcher;
}

export interface TreeWatcher extends Watcher {
  ignoresChanged(folder: string): void;
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
  {
    skip,
    ignored,
    onEvent,
    onError,
    onStopped = onError,
    signal,
    watch,
  }: TreeOptions,
): Promise<TreeWatcher> {
  const watched = new Map<string, WatchedFolder>();
  let disposed = false;
  const stopped = () => disposed || signal?.aborted === true;
  const inFlight = new InFlight();
  const reported = new Set<unknown>();
  const report = (error: unknown, to = onError) => {
    const code = error instanceof Error && 'code' in error ? error.code : '';
    const kind = to === onError ? code : `stopped ${String(code)}`;
    if (!isMissing(error) && !reported.has(kind) && !disposed) {
      reported.add(kind);
      to(error);
    }
  };
  const watchFailed = (folder: string) => (error: unknown) =>
    report(error, folder === root || outOfWatches(error) ? onStopped : onError);

  const ignoredFolders = new Map<string, Folder>();
  let ignoresGeneration = 0;
  const askIgnored = async (repo: string, paths: readonly string[]) => {
    for (;;) {
      const asked = ignoresGeneration;
      const answer = await ignored(repo, paths);
      if (asked === ignoresGeneration || stopped()) {
        return answer;
      }
    }
  };
  const recheckIgnored = (folder: string) => {
    const under = [...ignoredFolders.values()].filter((skipped) =>
      isInside(folder, skipped.path),
    );
    for (const skipped of under) {
      ignoredFolders.delete(skipped.path);
    }
    const watchedUnder = [...watched]
      .filter(([inside]) => inside !== folder && isInside(folder, inside))
      .map(([inside, { repo }]) => ({ path: inside, repo }));
    void inFlight.track(unwatchIgnored(watchedUnder).then(() => add(under)));
  };
  let ignoresChangedIn = new Set<string>();
  const ignoresChanged = (folder: string) => {
    ignoresGeneration++;
    if (ignoresChangedIn.size === 0) {
      setImmediate(() => {
        const folders = [...ignoresChangedIn];
        ignoresChangedIn = new Set();
        if (stopped()) {
          return;
        }
        for (const changed of folders) {
          if (
            !folders.some(
              (other) => other !== changed && isInside(other, changed),
            )
          ) {
            recheckIgnored(changed);
          }
        }
      });
    }
    ignoresChangedIn.add(folder);
  };

  const unwatchIgnored = async (folders: readonly Folder[]) => {
    const byRepo = Map.groupBy(
      folders.filter((folder) => folder.path !== folder.repo),
      (folder) => folder.repo,
    );
    await Promise.all(
      [...byRepo].map(async ([repo, inRepo]) => {
        let now: ReadonlySet<string>;
        try {
          now = new Set(
            await askIgnored(
              repo,
              inRepo.map((folder) => folder.path),
            ),
          );
        } catch (error) {
          report(error);
          return;
        }
        for (const folder of inRepo.toSorted(
          (a, b) => a.path.length - b.path.length,
        )) {
          if (now.has(folder.path) && watched.has(folder.path)) {
            unwatch(folder.path);
            ignoredFolders.set(folder.path, folder);
          }
        }
      }),
    );
  };

  const moveRepo = (folder: string, from: string, to: string) => {
    const entry = watched.get(folder);
    if (entry?.repo === from && from !== to) {
      entry.repo = to;
      for (const child of entry.children) {
        moveRepo(child, from, to);
      }
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
              : await askIgnored(
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
      stopped() ||
      watched.has(folder.path) ||
      (folder.path !== root && parent === undefined)
    ) {
      return [];
    }
    let entry: WatchedFolder | undefined;
    try {
      const watcher = watch(folder.path, (event, file) => {
        onEvent(folder.path, file, event);
        if (file === '.gitignore') {
          ignoresChanged(folder.path);
        }
        if (file && event === 'rename') {
          if (
            entry &&
            file === path.basename(folder.path) &&
            !fs.existsSync(path.join(folder.path, file))
          ) {
            entry.gone = true;
            renamed(folder.path);
          }
          if (entry && file === '.git') {
            moveRepo(
              folder.path,
              entry.repo,
              fs.existsSync(path.join(folder.path, file))
                ? folder.path
                : folder.repo,
            );
          }
          renamed(path.join(folder.path, file));
        }
      });
      entry = { watcher, repo: folder.repo, children: new Set(), gone: false };
    } catch (error) {
      watchFailed(folder.path)(error);
      return [];
    }
    entry.watcher.on('error', watchFailed(folder.path));
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
      .filter((child) => child.isDirectory())
      .map((child) => ({
        path: path.join(folder.path, child.name),
        repo: entry.repo,
      }))
      .filter((child) => !skip(child.path));
  };

  const add = async (folders: readonly Folder[]) => {
    let level = folders;
    while (level.length > 0) {
      if (stopped()) {
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
    if (file === root) {
      return isFolder ? [{ path: root, repo: root }] : [];
    }
    const parent = watched.get(path.dirname(file));
    return parent !== undefined && isFolder && !skip(file)
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
          Promise.all(files.map(created)).then(async (folders) => {
            const made = folders.flat();
            await add(made);
            for (const folder of made) {
              if (!stopped() && watched.has(folder.path)) {
                onEvent(
                  path.dirname(folder.path),
                  path.basename(folder.path),
                  'rename',
                );
              }
            }
          }),
        );
      });
    }
    renames.add(file);
  };

  await add([{ path: root, repo: root }]);

  return {
    ignoresChanged,
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

export function watchOneFolder(
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

export function isInside(folder: string, file: string): boolean {
  const relative = path.relative(folder, file);
  return (
    relative === '' ||
    (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative))
  );
}

const maxKnownNotIgnored = 10_000;

export class NotIgnored {
  private readonly known = new Set<string>();
  private generation = 0;

  forget(): void {
    this.known.clear();
    this.generation++;
  }

  async any(
    ignored: Ignored,
    root: string,
    files: readonly string[],
    renamed: ReadonlySet<string>,
  ): Promise<boolean> {
    if (files.length === 0) {
      return false;
    }
    if (files.some((file) => this.known.has(file))) {
      return true;
    }
    const { generation } = this;
    let found: ReadonlySet<string>;
    try {
      found = new Set(await ignoredInRepositories(ignored, root, files));
    } catch {
      return true;
    }
    const kept = files.filter((file) => !found.has(file));
    const stats = await Promise.all(
      kept.map((file) => fs.promises.lstat(file).catch(() => undefined)),
    );
    const existingFiles = kept.filter(
      (_file, index) => stats[index]?.isDirectory() === false,
    );
    if (generation === this.generation) {
      if (this.known.size + existingFiles.length > maxKnownNotIgnored) {
        this.known.clear();
      }
      for (const file of existingFiles) {
        this.known.add(file);
      }
    }
    const changedItself = (file: string, index: number) =>
      renamed.has(file) || stats[index]?.isDirectory() !== true;
    return kept.some(changedItself);
  }
}

async function ignoredInRepositories(
  ignored: Ignored,
  root: string,
  files: readonly string[],
): Promise<string[]> {
  const holding = new Map<string, Promise<string>>();
  const repoHolding = (folder: string): Promise<string> => {
    if (folder === root || !isInside(root, folder)) {
      return Promise.resolve(root);
    }
    let repo = holding.get(folder);
    if (repo === undefined) {
      repo = fs.promises.lstat(path.join(folder, '.git')).then(
        () => folder,
        () => repoHolding(path.dirname(folder)),
      );
      holding.set(folder, repo);
    }
    return repo;
  };
  const repoOf = new Map<string, string>();
  let level = files;
  while (level.length > 0) {
    const repos = await Promise.all(
      level.map((file) => repoHolding(path.dirname(file))),
    );
    for (const [index, file] of level.entries()) {
      repoOf.set(file, repos[index]);
    }
    level = [...new Set(repos)].filter(
      (repo) => repo !== root && !repoOf.has(repo),
    );
  }
  const byRepo = Map.groupBy(repoOf, ([, repo]) => repo);
  const found = new Set(
    (
      await Promise.all(
        [...byRepo].map(([repo, inRepo]) =>
          ignored(
            repo,
            inRepo.map(([file]) => file),
          ),
        ),
      )
    ).flat(),
  );
  const isIgnored = (file: string): boolean => {
    const repo = repoOf.get(file) ?? root;
    return found.has(file) || (repo !== root && isIgnored(repo));
  };
  return files.filter(isIgnored);
}
