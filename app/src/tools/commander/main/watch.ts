import * as fs from 'node:fs';
import * as path from 'node:path';

export type WatchFolder = (folder: string, onChange: () => void) => () => void;

const changeDelay = 50;
const settleDelay = 250;

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

export function watchFolder(
  folder: string,
  onChange: () => void,
  delay = changeDelay,
  {
    settle = settleDelay,
    start = startWatching,
    stat = fs.promises.stat,
  }: {
    readonly settle?: number;
    readonly start?: StartWatching;
    readonly stat?: Stat;
  } = {},
): () => void {
  let pending: NodeJS.Timeout | undefined;
  let stopped = false;
  let stopWatching: (() => void) | undefined;
  const changed = () => {
    if (stopped) {
      return;
    }
    pending ??= setTimeout(() => {
      pending = undefined;
      onChange();
    }, delay);
  };
  const watchAnswered = (stamp: string): (() => void) | undefined => {
    const own = watched(start, folder, changed);
    if (own === undefined) {
      return undefined;
    }
    const settled = setTimeout(() => {
      void stat(folder).then(
        (stats) => stampOf(stats) !== stamp && changed(),
        () => changed(),
      );
    }, settle);
    own.on('error', changed);
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
  void stat(folder).then(
    (stats) => {
      if (!stopped) {
        stopWatching = watchAnswered(stampOf(stats));
      }
    },
    () => {},
  );
  return () => {
    stopped = true;
    clearTimeout(pending);
    stopWatching?.();
  };
}
