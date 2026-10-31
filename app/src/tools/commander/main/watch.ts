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

function stampOf(stats: fs.Stats | undefined): string | undefined {
  return stats && `${stats.ino}:${stats.mtimeMs}`;
}

export function watchFolder(
  folder: string,
  onChange: () => void,
  delay = changeDelay,
  {
    settle = settleDelay,
    start = startWatching,
  }: { readonly settle?: number; readonly start?: StartWatching } = {},
): () => void {
  let pending: NodeJS.Timeout | undefined;
  let stopped = false;
  const changed = () => {
    if (stopped) {
      return;
    }
    pending ??= setTimeout(() => {
      pending = undefined;
      onChange();
    }, delay);
  };
  const stamp = stampOf(fs.statSync(folder, { throwIfNoEntry: false }));
  const own = watched(start, folder, changed);
  if (own === undefined) {
    return () => {};
  }
  const settled = setTimeout(() => {
    void fs.promises.stat(folder).then(
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
    stopped = true;
    clearTimeout(settled);
    clearTimeout(pending);
    own.close();
    around?.close();
  };
}
