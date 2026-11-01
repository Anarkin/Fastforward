import * as fs from 'node:fs';
import * as path from 'node:path';

const changeDelay = 100;

export function watchFiles(
  files: readonly string[],
  onChange: () => void,
  onFailed: (error: unknown) => void,
  delay = changeDelay,
): () => void {
  let pending: NodeJS.Timeout | undefined;
  let stopped = false;
  const changed = () => {
    if (!stopped) {
      pending ??= setTimeout(() => {
        pending = undefined;
        onChange();
      }, delay);
    }
  };
  const folders = Map.groupBy(files, (file) => path.dirname(file));
  const watchers = [...folders].flatMap(([folder, inside]) => {
    const names = new Set(inside.map((file) => path.basename(file)));
    try {
      const watcher = fs.watch(
        folder,
        { persistent: false },
        (_event, name) => {
          if (name === null || names.has(name)) {
            changed();
          }
        },
      );
      watcher.on('error', (error) => {
        onFailed(error);
        changed();
      });
      return [watcher];
    } catch (error) {
      onFailed(error);
      return [];
    }
  });
  return () => {
    stopped = true;
    clearTimeout(pending);
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}
