import * as fs from 'node:fs';
import * as path from 'node:path';

export type WatchFolder = (folder: string, onChange: () => void) => () => void;

const changeDelay = 50;

function watched(
  folder: string,
  listener: (event: string, name: string | null) => void,
): fs.FSWatcher | undefined {
  try {
    return fs.watch(folder, { persistent: false }, listener);
  } catch {
    return undefined;
  }
}

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
  const own = watched(folder, changed);
  if (own === undefined) {
    return () => {};
  }
  own.on('error', changed);
  const parent = path.dirname(folder);
  const name = path.basename(folder);
  const around =
    parent === folder
      ? undefined
      : watched(parent, (_event, changedName) => {
          if (changedName === name) {
            changed();
          }
        });
  around?.on('error', () => around.close());
  return () => {
    clearTimeout(pending);
    own.close();
    around?.close();
  };
}
