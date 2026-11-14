import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  folderStamp,
  watchFolder,
  watchTree,
} from '../../../../../tools/commander/main/watch';
import { waitFor } from '../../../../helpers/fixtures';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';

const deaf = (elsewhere: string) => (): fs.FSWatcher =>
  fs.watch(elsewhere, { persistent: false }, () => {});

const watching =
  (counted: { started: number }) =>
  (
    watched: string,
    listener: (event: string, name: string | null) => void,
  ): fs.FSWatcher => {
    counted.started++;
    return fs.watch(watched, { persistent: false }, listener);
  };

suite('Watching a folder of the commander', () => {
  let folder: string;
  let stops: (() => void)[];

  beforeEach(() => {
    folder = tempFolder('commander-watch');
    stops = [];
  });

  afterEach(() => {
    for (const stop of stops) {
      stop();
    }
    removeFolder(folder);
  });

  test('tells of files made in the folder, a burst of changes in far fewer calls than changes', async () => {
    let changes = 0;
    stops.push(watchFolder(folder, () => changes++, undefined, { delay: 200 }));
    await waitFor(() => {
      fs.writeFileSync(path.join(folder, 'ready.txt'), String(Date.now()));
      return changes > 0;
    }, 'the watching to start');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const before = changes;

    for (let index = 0; index < 20; index++) {
      fs.writeFileSync(path.join(folder, `file${index}.txt`), 'x');
    }
    await waitFor(() => changes > before, 'a change');
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.ok(changes - before < 5, String(changes - before));
  });

  test('tells of the folder removed itself, once the watching has started, which macOS does a moment after it is asked', async () => {
    const watched = path.join(folder, 'watched');
    fs.mkdirSync(watched);
    let changes = 0;
    stops.push(watchFolder(watched, () => changes++, undefined, { delay: 10 }));
    await waitFor(() => {
      fs.writeFileSync(path.join(watched, 'ready.txt'), String(Date.now()));
      return changes > 0;
    }, 'the watching to start');
    const before = changes;

    fs.rmSync(watched, { recursive: true });

    await waitFor(() => changes > before, 'the removal');
  });

  suite(
    'before the watching has started, as on macOS a moment after it is asked',
    () => {
      test('tells of the folder removed', async () => {
        const watched = path.join(folder, 'watched');
        const elsewhere = path.join(folder, 'elsewhere');
        fs.mkdirSync(watched);
        fs.mkdirSync(elsewhere);
        const listed = fs.statSync(watched);
        let looked = false;
        let changes = 0;
        stops.push(
          watchFolder(watched, () => changes++, undefined, {
            delay: 10,
            settle: 20,
            start: deaf(elsewhere),
            stat: (asked) => {
              if (looked) {
                return fs.promises.stat(asked);
              }
              looked = true;
              return Promise.resolve(listed);
            },
          }),
        );

        fs.rmSync(watched, { recursive: true });

        await waitFor(() => changes > 0, 'the removal');
      });

      test('tells of a file added', async () => {
        const elsewhere = path.join(folder, 'elsewhere');
        fs.mkdirSync(elsewhere);
        let changes = 0;
        stops.push(
          watchFolder(folder, () => changes++, undefined, {
            delay: 10,
            settle: 20,
            start: deaf(elsewhere),
          }),
        );

        await new Promise((resolve) => setTimeout(resolve, 5));
        fs.writeFileSync(path.join(folder, 'added.txt'), 'x');

        await waitFor(() => changes > 0, 'the file added');
      });

      test('tells of a file added once the folder was listed, before it was asked to be watched, as a side shown again missed a file made while it was listed', async () => {
        const minuteAgo = new Date(Date.now() - 60_000);
        fs.utimesSync(folder, minuteAgo, minuteAgo);
        const listed = await folderStamp(folder);
        fs.writeFileSync(path.join(folder, 'added.txt'), 'x');
        let changes = 0;
        stops.push(
          watchFolder(folder, () => changes++, listed, {
            delay: 10,
            settle: 20,
          }),
        );

        await waitFor(() => changes > 0, 'the file added');
      });

      test('tells nothing when nothing changed, nor once stopped', async () => {
        const elsewhere = path.join(folder, 'elsewhere');
        const stopped = path.join(folder, 'stopped');
        fs.mkdirSync(elsewhere);
        fs.mkdirSync(stopped);
        let changes = 0;
        stops.push(
          watchFolder(folder, () => changes++, undefined, {
            delay: 10,
            settle: 20,
            start: deaf(elsewhere),
          }),
        );
        watchFolder(stopped, () => changes++, undefined, {
          delay: 10,
          settle: 20,
        })();
        fs.writeFileSync(path.join(stopped, 'late.txt'), 'x');

        await new Promise((resolve) => setTimeout(resolve, 100));

        assert.strictEqual(changes, 0);
      });
    },
  );

  suite(
    'a folder that does not answer, as a share cut off from the network',
    () => {
      test('is watched only once it answers, holding nothing up meanwhile', async () => {
        const counted = { started: 0 };
        const answers: ((stats: fs.Stats) => void)[] = [];
        let changes = 0;
        stops.push(
          watchFolder(folder, () => changes++, undefined, {
            delay: 10,
            stat: () => new Promise((resolve) => answers.push(resolve)),
            start: watching(counted),
          }),
        );

        assert.strictEqual(counted.started, 0);
        answers[0]?.(fs.statSync(folder));
        await waitFor(() => counted.started > 0, 'the watching to start');
        fs.writeFileSync(path.join(folder, 'added.txt'), 'x');

        await waitFor(() => changes > 0, 'the file added');
      });

      test('is not watched once stopped before it answers, nor when it fails to', async () => {
        const counted = { started: 0 };
        const answers: ((stats: fs.Stats) => void)[] = [];
        watchFolder(folder, () => {}, undefined, {
          delay: 10,
          stat: () => new Promise((resolve) => answers.push(resolve)),
          start: watching(counted),
        })();
        stops.push(
          watchFolder(folder, () => {}, undefined, {
            delay: 10,
            stat: () => Promise.reject(new Error('ETIMEDOUT')),
            start: watching(counted),
          }),
        );

        answers[0]?.(fs.statSync(folder));
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.strictEqual(counted.started, 0);
      });
    },
  );

  test('watches the folder again once its watching fails, as a network share gone for a moment stopped telling of its changes for good', async () => {
    const own: fs.FSWatcher[] = [];
    const start = (
      watched: string,
      listener: (event: string, name: string | null) => void,
    ): fs.FSWatcher => {
      const watcher = fs.watch(watched, { persistent: false }, listener);
      if (watched === folder) {
        own.push(watcher);
      }
      return watcher;
    };
    let changes = 0;
    stops.push(
      watchFolder(folder, () => changes++, undefined, {
        delay: 10,
        settle: 10,
        start,
      }),
    );
    await waitFor(() => own.length === 1, 'the watching to start');
    const [failed] = own;
    failed?.close();
    failed?.emit('error', new Error('EPERM: operation not permitted, watch'));
    await waitFor(() => own.length === 2, 'the watching to start again');
    changes = 0;
    await waitFor(() => {
      fs.writeFileSync(path.join(folder, 'later.txt'), String(Math.random()));
      return changes > 0;
    }, 'a change after');
  });

  test('goes on trying to watch the folder while it does not answer, and tells of what changed meanwhile, as a share gone for longer than a moment was never watched again', async () => {
    const own: fs.FSWatcher[] = [];
    const start = (
      watched: string,
      listener: (event: string, name: string | null) => void,
    ): fs.FSWatcher => {
      const watcher = fs.watch(watched, { persistent: false }, listener);
      if (watched === folder) {
        own.push(watcher);
      }
      return watcher;
    };
    let answering = true;
    let unanswered = 0;
    const stat = (asked: string): Promise<fs.Stats> => {
      if (answering) {
        return fs.promises.stat(asked);
      }
      unanswered++;
      return Promise.reject(new Error('ETIMEDOUT'));
    };
    let changes = 0;
    stops.push(
      watchFolder(folder, () => changes++, undefined, {
        delay: 10,
        settle: 10,
        start,
        stat,
      }),
    );
    await waitFor(() => own.length === 1, 'the watching to start');
    answering = false;
    const [failed] = own;
    failed?.close();
    failed?.emit('error', new Error('EPERM: operation not permitted, watch'));
    await waitFor(() => unanswered >= 2, 'two looks unanswered');
    fs.writeFileSync(path.join(folder, 'meanwhile.txt'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 30));
    changes = 0;

    answering = true;

    await waitFor(() => own.length === 2, 'the watching to start again');
    await waitFor(() => changes > 0, 'the change made meanwhile');
  });

  test('tries again to watch a folder the system would not watch', async () => {
    let refusals = 0;
    const counted = { started: 0 };
    const start = (
      watched: string,
      listener: (event: string, name: string | null) => void,
    ): fs.FSWatcher => {
      if (watched === folder && refusals < 2) {
        refusals++;
        throw new Error('EMFILE: too many open files, watch');
      }
      return watching(counted)(watched, listener);
    };
    let changes = 0;
    stops.push(
      watchFolder(folder, () => changes++, undefined, {
        delay: 10,
        settle: 10,
        start,
      }),
    );

    await waitFor(() => refusals === 2 && counted.started > 0, 'a watch');
    await waitFor(() => {
      fs.writeFileSync(path.join(folder, 'later.txt'), String(Math.random()));
      return changes > 0;
    }, 'a change after');
  });

  test('watches anew a folder made in place of the one it watched, and stops watching one removed rather than hearing of it without end, as Windows tells of a removed folder again and again', async () => {
    const watched = path.join(folder, 'watched');
    fs.mkdirSync(watched);
    const counted = { started: 0 };
    let changes = 0;
    stops.push(
      watchFolder(watched, () => changes++, undefined, {
        delay: 10,
        settle: 20,
        start: watching(counted),
      }),
    );
    await waitFor(() => {
      fs.writeFileSync(path.join(watched, 'ready.txt'), String(Date.now()));
      return changes > 0;
    }, 'the watching to start');
    const startedBefore = counted.started;

    fs.rmSync(watched, { recursive: true });
    fs.mkdirSync(watched);
    await waitFor(
      () => counted.started > startedBefore,
      'the folder made anew to be watched',
    );
    const beforeAdded = changes;
    await waitFor(() => {
      fs.writeFileSync(path.join(watched, 'added.txt'), String(Date.now()));
      return changes > beforeAdded;
    }, 'a file added to the folder made anew');

    fs.rmSync(watched, { recursive: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const afterRemoval = changes;
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.ok(changes - afterRemoval < 3, String(changes - afterRemoval));
  });

  test('tells nothing once stopped, nor for a folder it could not watch', async () => {
    let changes = 0;
    watchFolder(folder, () => changes++, undefined, { delay: 10 })();
    stops.push(
      watchFolder(path.join(folder, 'missing'), () => changes++, undefined, {
        delay: 10,
      }),
    );

    fs.writeFileSync(path.join(folder, 'late.txt'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(changes, 0);
  });
});

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
