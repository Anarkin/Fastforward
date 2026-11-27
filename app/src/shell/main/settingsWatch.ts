import { startWatching } from '../../lib/main/watch';
import { fs } from '../../lib/main/files';
import type { Stats } from '../../lib/main/files';
import * as path from 'node:path';

export function watchSettings(
  file: string,
  onChange: () => void,
  delay = 200,
  target = realPath(file),
  lookEvery = 1000,
): () => void {
  let timer: NodeJS.Timeout | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, delay);
  };
  const files = [...new Set([file, target])];
  const watchers = files.map((watched) => {
    const folder = path.dirname(watched);
    let stamp = stampOf(watched);
    const watcher = startWatching(folder, (_event, name) => {
      if (!fs.existsSync(folder)) {
        watcher.close();
        return;
      }
      const now = stampOf(watched);
      if (name === path.basename(watched) || now !== stamp) {
        stamp = now;
        changed();
      }
    });
    watcher.on('error', () => watcher.close());
    return watcher;
  });
  const looked = (now: Stats, before: Stats) => {
    if (now.mtimeMs !== before.mtimeMs || now.size !== before.size) {
      changed();
    }
  };
  for (const watched of files) {
    fs.watchFile(watched, { interval: lookEvery, persistent: false }, looked);
  }
  timer = setTimeout(onChange, delay);
  return () => {
    clearTimeout(timer);
    for (const watcher of watchers) {
      watcher.close();
    }
    for (const watched of files) {
      fs.unwatchFile(watched, looked);
    }
  };
}

function stampOf(file: string): string | undefined {
  try {
    const stats = fs.statSync(file);
    return `${stats.size}:${stats.mtimeMs}`;
  } catch {
    return undefined;
  }
}

function realPath(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}
