import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../helpers/builtins';
import { watchSettings } from '../../../../shell/main/settingsWatch';
import { waitFor } from '../../../helpers/fixtures';
import {
  removeFolder,
  symlinkOrSkip,
  tempFolder,
} from '../../../helpers/repositories';

function watchersMade(run: () => void): fs.FSWatcher[] {
  const nodeFs = process.getBuiltinModule('node:fs');
  const { watch } = nodeFs;
  const made: fs.FSWatcher[] = [];
  replaceBuiltin(nodeFs, 'watch', (...args: Parameters<typeof watch>) => {
    const real = watch(...args);
    made.push(real);
    return real;
  });
  process.getBuiltinModule('node:module').syncBuiltinESMExports();
  try {
    run();
  } finally {
    replaceBuiltin(nodeFs, 'watch', watch);
    process.getBuiltinModule('node:module').syncBuiltinESMExports();
  }
  return made;
}

suite('Watching the settings file', () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = tempFolder('settings');
    file = path.join(folder, 'settings.user.json');
  });

  afterEach(() => removeFolder(folder));

  const noticed = async (changed: string, target?: string): Promise<void> => {
    let changes = 0;
    const stop = watchSettings(
      file,
      () => {
        changes += 1;
      },
      10,
      target,
    );
    try {
      await waitFor(() => changes > 0, 'the first check');
      changes = 0;
      await waitFor(() => {
        fs.writeFileSync(changed, JSON.stringify({ solo: true }));
        return changes > 0;
      }, 'the change');
    } finally {
      stop();
    }
  };

  test('checks the file once as it starts watching, as it may have changed since it was read, as while the app looks for git', async () => {
    let checks = 0;
    const stop = watchSettings(file, () => (checks += 1), 10);
    try {
      await waitFor(() => checks > 0, 'the first check');
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.strictEqual(checks, 1);
    } finally {
      stop();
    }
  });

  test('notices the file changed though the system names another file or none, as macOS does once it merges the changes of several files, and nothing while it is as it was', async () => {
    let checks = 0;
    let stop: (() => void) | undefined;
    const [watcher] = watchersMade(() => {
      stop = watchSettings(file, () => (checks += 1), 10);
    });
    try {
      await waitFor(() => checks > 0, 'the first check');
      watcher.close();
      checks = 0;
      watcher.emit('change', 'change', 'state.json');
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.strictEqual(checks, 0);
      fs.writeFileSync(file, JSON.stringify({ solo: true }));
      watcher.emit('change', 'change', 'state.json');
      await waitFor(() => checks === 1, 'the change named after another file');
      fs.writeFileSync(file, JSON.stringify({ solo: false, more: 1 }));
      watcher.emit('change', 'rename', null);
      await waitFor(() => checks === 2, 'the change named after no file');
    } finally {
      stop?.();
    }
  });

  test('notices the file changed though the system tells nothing of it, as macOS may not while it watches folders anew, by looking at the file every so often', async () => {
    let checks = 0;
    let stop: (() => void) | undefined;
    const watchers = watchersMade(() => {
      stop = watchSettings(file, () => (checks += 1), 10, file, 20);
    });
    try {
      await waitFor(() => checks > 0, 'the first check');
      for (const watcher of watchers) {
        watcher.close();
      }
      checks = 0;
      fs.writeFileSync(file, JSON.stringify({ solo: true }));
      await waitFor(() => checks > 0, 'the change seen without being told');
    } finally {
      stop?.();
    }
  });

  test('stops watching a folder whose watcher fails, rather than throwing into the main process', async () => {
    let stop: (() => void) | undefined;
    const [watcher] = watchersMade(() => {
      stop = watchSettings(file, () => {}, 10);
    });
    try {
      let closed = false;
      watcher.on('close', () => {
        closed = true;
      });
      watcher.emit(
        'error',
        Object.assign(new Error('EPERM: operation not permitted, watch'), {
          code: 'EPERM',
        }),
      );
      await waitFor(() => closed, 'the watcher to stop');
    } finally {
      stop?.();
    }
  });

  test(
    'stops watching the folder of the file a symlink points to once that folder is removed, as Windows then tells of changes in it without end',
    { timeout: 20_000 },
    async () => {
      const target = path.join(folder, 'dotfiles', 'settings.json');
      fs.mkdirSync(path.dirname(target));
      fs.writeFileSync(target, '{}');
      let stop: (() => void) | undefined;
      let changes = 0;
      const made = watchersMade(() => {
        stop = watchSettings(
          file,
          () => {
            changes += 1;
          },
          10,
          target,
        );
      });
      try {
        const closed = new Set<fs.FSWatcher>();
        for (const watcher of made) {
          watcher.on('close', () => closed.add(watcher));
        }
        await waitFor(() => changes > 0, 'the first check');
        changes = 0;
        await waitFor(() => {
          fs.writeFileSync(target, JSON.stringify({ solo: true }));
          return changes > 0;
        }, 'the watcher of the folder to start');
        fs.rmSync(path.dirname(target), { recursive: true });
        await waitFor(() => closed.size === 1, 'the watcher to stop');
        assert.strictEqual(closed.has(made[0]), false);
      } finally {
        stop?.();
      }
    },
  );

  test(
    'notices a change to the file it was given as the one the settings resolve to, in another folder, as an editor writes to the file a symlink points to',
    { timeout: 20_000 },
    async () => {
      const target = path.join(folder, 'dotfiles', 'settings.json');
      fs.mkdirSync(path.dirname(target));
      await noticed(target, target);
    },
  );

  test(
    'finds the file a symlink points to for watching',
    { timeout: 20_000 },
    async (context) => {
      const target = path.join(folder, 'dotfiles', 'settings.json');
      fs.mkdirSync(path.dirname(target));
      fs.writeFileSync(target, '{}');
      symlinkOrSkip(context, target, file);
      await noticed(target);
    },
  );
});
