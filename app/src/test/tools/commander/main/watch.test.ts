import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { watchFolder } from '../../../../tools/commander/main/watch';
import { waitFor } from '../../../fixtures';
import { removeFolder, tempFolder } from '../../../repositories';

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

  test('tells of the folder removed itself', async () => {
    const watched = path.join(folder, 'watched');
    fs.mkdirSync(watched);
    let changes = 0;
    stops.push(watchFolder(watched, () => changes++, 10));

    fs.rmSync(watched, { recursive: true });

    await waitFor(() => changes > 0, 'the removal');
  });

  test('tells nothing once stopped, nor for a folder it could not watch', async () => {
    let changes = 0;
    watchFolder(folder, () => changes++, 10)();
    stops.push(watchFolder(path.join(folder, 'missing'), () => changes++, 10));

    fs.writeFileSync(path.join(folder, 'late.txt'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(changes, 0);
  });
});
