import * as fs from 'node:fs';
import * as path from 'node:path';

export type WatchFolder = (
  folder: string,
  onChange: () => void,
  listed?: string,
) => () => void;

const changeDelay = 50;
const settleDelay = 250;
const longestRetry = 60_000;

type StartWatching = (
  folder: string,
  listener: (event: string, name: string | null) => void,
) => fs.FSWatcher;

const startWatching: StartWatching = (folder, listener) =>
  fs.watch(folder, { persistent: false }, listener);

function watched(
  start: StartWatching,
  folder: string,
  listener: (event: string, name: string | null) => void,
): fs.FSWatcher | undefined {
  try {
    return start(folder, listener);
  } catch {
    return undefined;
  }
}

type Stat = (folder: string) => Promise<fs.Stats>;

function stampOf(stats: fs.Stats): string {
  return `${stats.ino}:${stats.mtimeMs}`;
}

export function folderStamp(folder: string): Promise<string | undefined> {
  return fs.promises.stat(folder).then(stampOf, () => undefined);
}

export function watchFolder(
  folder: string,
  onChange: () => void,
  listed?: string,
  {
    delay = changeDelay,
    settle = settleDelay,
    start = startWatching,
    stat = fs.promises.stat,
  }: {
    readonly delay?: number;
    readonly settle?: number;
    readonly start?: StartWatching;
    readonly stat?: Stat;
  } = {},
): () => void {
  let pending: NodeJS.Timeout | undefined;
  let retrying: NodeJS.Timeout | undefined;
  let failures = 0;
  let stopped = false;
  let stopWatching: (() => void) | undefined;
  let watchedIno: number | undefined;
  let looking = false;
  const lookAgain = () => {
    if (looking || stopWatching === undefined) {
      return;
    }
    looking = true;
    void stat(folder)
      .then(
        (stats) => stats.ino === watchedIno,
        () => false,
      )
      .then((same) => {
        looking = false;
        if (!same && !stopped && stopWatching !== undefined) {
          watchAgain();
        }
      });
  };
  const changed = () => {
    if (stopped) {
      return;
    }
    pending ??= setTimeout(() => {
      pending = undefined;
      onChange();
      lookAgain();
    }, delay);
  };
  const heard = (_event: string, name: string | null) => {
    if (name !== null && path.isAbsolute(name) && stopWatching !== undefined) {
      watchAgain();
    }
    changed();
  };
  const watchAnswered = (stamp: string): (() => void) | undefined => {
    const own = watched(start, folder, heard);
    if (own === undefined) {
      return undefined;
    }
    const settled = setTimeout(() => {
      void stat(folder).then(
        (stats) => stampOf(stats) !== stamp && changed(),
        () => changed(),
      );
    }, settle);
    own.on('error', () => {
      changed();
      watchAgain();
    });
    const parent = path.dirname(folder);
    const name = path.basename(folder);
    const around =
      parent === folder
        ? undefined
        : watched(start, parent, (_event, changedName) => {
            if (changedName === name) {
              changed();
            }
          });
    around?.on('error', () => around.close());
    return () => {
      clearTimeout(settled);
      own.close();
      around?.close();
    };
  };
  const begin = () =>
    void stat(folder).then(
      (stats) => {
        if (stopped) {
          return;
        }
        watchedIno = stats.ino;
        stopWatching = watchAnswered(listed ?? stampOf(stats));
        if (stopWatching === undefined) {
          watchAgain();
        } else if (failures > 0) {
          failures = 0;
          changed();
        }
      },
      () => {
        if (!stopped) {
          watchAgain();
        }
      },
    );
  const watchAgain = () => {
    stopWatching?.();
    stopWatching = undefined;
    clearTimeout(retrying);
    retrying = setTimeout(
      begin,
      Math.min(settle * 2 ** failures++, longestRetry),
    );
  };
  begin();
  return () => {
    stopped = true;
    clearTimeout(pending);
    clearTimeout(retrying);
    stopWatching?.();
  };
}

export type WatchTree = (
  folder: string,
  onChange: (changed: string | undefined) => void,
) => () => void;

const startWatchingTree: StartWatching = (folder, listener) =>
  fs.watch(folder, { persistent: false, recursive: true }, listener);

export function watchTree(
  folder: string,
  onChange: (changed: string | undefined) => void,
  start: StartWatching = startWatchingTree,
): () => void {
  let stopped = false;
  const watcher = watched(start, folder, (_event, name) => {
    if (stopped) {
      return;
    }
    if (name !== null && path.isAbsolute(name)) {
      stopped = true;
      watcher?.close();
      onChange(undefined);
      return;
    }
    onChange(name ?? undefined);
  });
  if (watcher === undefined) {
    return () => {};
  }
  watcher.on('error', () => {
    if (!stopped) {
      stopped = true;
      watcher.close();
      onChange(undefined);
    }
  });
  return () => {
    if (!stopped) {
      stopped = true;
      watcher.close();
    }
  };
}
