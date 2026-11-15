import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { watchTree } from '../../../../../tools/commander/main/watchTree';
import { waitFor } from '../../../../helpers/fixtures';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';

suite('Watching a folder and every folder in it', () => {
  let folder: string;
  let stops: (() => void)[];

  beforeEach(() => {
    folder = tempFolder('commander-watch-tree');
    stops = [];
  });

  afterEach(() => {
    for (const stop of stops) {
      stop();
    }
    removeFolder(folder);
  });

  test.skipIf(process.platform === 'linux')(
    'tells the path under the folder of what changed in a folder in it',
    async () => {
      const deeper = path.join(folder, 'photos', '2024');
      fs.mkdirSync(deeper, { recursive: true });
      const changed: (string | undefined)[] = [];
      stops.push(watchTree(folder, (each) => changed.push(each)));
      await waitFor(() => {
        fs.writeFileSync(path.join(deeper, 'cat.jpg'), String(Date.now()));
        return changed.includes(path.join('photos', '2024', 'cat.jpg'));
      }, 'the change of the file');
    },
  );

  test('tells of no path once the system cannot say what changed, and stops watching', () => {
    const events: ((event: string, name: string | null) => void)[] = [];
    const watchers: fs.FSWatcher[] = [];
    let closed = 0;
    const start = (
      watched: string,
      listener: (event: string, name: string | null) => void,
    ) => {
      events.push(listener);
      const watcher = fs.watch(watched, { persistent: false });
      const close = watcher.close.bind(watcher);
      watcher.close = () => {
        closed++;
        close();
      };
      watchers.push(watcher);
      return watcher;
    };
    const changed: (string | undefined)[] = [];
    stops.push(watchTree(folder, (each) => changed.push(each), start));

    events[0]('change', path.join('a', 'b.txt'));
    events[0]('rename', null);
    watchers[0].emit('error', new Error('EPERM: operation not permitted'));

    assert.deepStrictEqual(changed, [
      path.join('a', 'b.txt'),
      undefined,
      undefined,
    ]);
    assert.strictEqual(closed, 1);
  });

  test('tells of no path and stops watching once the system names the folder itself, as Windows names a removed folder by its whole path without end', () => {
    const events: ((event: string, name: string | null) => void)[] = [];
    let closed = 0;
    const start = (
      watched: string,
      listener: (event: string, name: string | null) => void,
    ) => {
      events.push(listener);
      const watcher = fs.watch(watched, { persistent: false });
      const close = watcher.close.bind(watcher);
      watcher.close = () => {
        closed++;
        close();
      };
      return watcher;
    };
    const changed: (string | undefined)[] = [];
    stops.push(watchTree(folder, (each) => changed.push(each), start));

    const itself = process.platform === 'win32' ? `\\\\?\\${folder}` : folder;
    events[0]('rename', 'photos');
    events[0]('rename', itself);
    events[0]('rename', itself);
    events[0]('rename', folder);

    assert.deepStrictEqual(changed, ['photos', undefined]);
    assert.strictEqual(closed, 1);
  });

  test('tells nothing when the system would not watch the folder', () => {
    const changed: (string | undefined)[] = [];
    stops.push(
      watchTree(
        folder,
        (each) => changed.push(each),
        () => {
          throw new Error('EMFILE: too many open files, watch');
        },
      ),
    );

    assert.deepStrictEqual(changed, []);
  });

  test('tells nothing once stopped', async () => {
    const changed: (string | undefined)[] = [];
    watchTree(folder, (each) => changed.push(each))();

    fs.writeFileSync(path.join(folder, 'late.txt'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.deepStrictEqual(changed, []);
  });
});
