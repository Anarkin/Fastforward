import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { watchFolder } from '../../../../tools/commander/main/watch';
import { waitFor } from '../../../fixtures';
import { removeFolder, tempFolder } from '../../../repositories';

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
    stops.push(watchFolder(folder, () => changes++, 200));

    for (let index = 0; index < 20; index++) {
      fs.writeFileSync(path.join(folder, `file${index}.txt`), 'x');
    }
    await waitFor(() => changes > 0, 'a change');
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.ok(changes < 5, String(changes));
  });

  test('tells of the folder removed itself, once the watching has started, which macOS does a moment after it is asked', async () => {
    const watched = path.join(folder, 'watched');
    fs.mkdirSync(watched);
    let changes = 0;
    stops.push(watchFolder(watched, () => changes++, 10));
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
        let changes = 0;
        stops.push(
          watchFolder(watched, () => changes++, 10, {
            settle: 20,
            start: deaf(elsewhere),
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
          watchFolder(folder, () => changes++, 10, {
            settle: 20,
            start: deaf(elsewhere),
          }),
        );

        await new Promise((resolve) => setTimeout(resolve, 5));
        fs.writeFileSync(path.join(folder, 'added.txt'), 'x');

        await waitFor(() => changes > 0, 'the file added');
      });

      test('tells nothing when nothing changed, nor once stopped', async () => {
        const elsewhere = path.join(folder, 'elsewhere');
        const stopped = path.join(folder, 'stopped');
        fs.mkdirSync(elsewhere);
        fs.mkdirSync(stopped);
        let changes = 0;
        stops.push(
          watchFolder(folder, () => changes++, 10, {
            settle: 20,
            start: deaf(elsewhere),
          }),
        );
        watchFolder(stopped, () => changes++, 10, { settle: 20 })();
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
          watchFolder(folder, () => changes++, 10, {
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
        watchFolder(folder, () => {}, 10, {
          stat: () => new Promise((resolve) => answers.push(resolve)),
          start: watching(counted),
        })();
        stops.push(
          watchFolder(folder, () => {}, 10, {
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

  test('tells nothing once stopped, nor for a folder it could not watch', async () => {
    let changes = 0;
    watchFolder(folder, () => changes++, 10)();
    stops.push(watchFolder(path.join(folder, 'missing'), () => changes++, 10));

    fs.writeFileSync(path.join(folder, 'late.txt'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(changes, 0);
  });
});
