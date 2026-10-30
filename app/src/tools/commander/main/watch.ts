import * as fs from 'node:fs';

export type WatchFolder = (folder: string, onChange: () => void) => () => void;

const changeDelay = 50;

export function watchFolder(
  folder: string,
  onChange: () => void,
  delay = changeDelay,
): () => void {
  let pending: NodeJS.Timeout | undefined;
  const changed = () => {
    pending ??= setTimeout(() => {
      pending = undefined;
      onChange();
    }, delay);
  };
  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(folder, { persistent: false }, changed);
  } catch {
    return () => {};
  }
  watcher.on('error', changed);
  return () => {
    clearTimeout(pending);
    watcher.close();
  };
}
