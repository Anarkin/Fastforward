import * as fs from 'node:fs';
import * as path from 'node:path';
import { watched, type StartWatching } from '../../../lib/main/watch';

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
