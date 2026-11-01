import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { watchFiles } from '../../../../tools/git/main/compareWatch';
import { waitFor } from '../../../fixtures';
import { removeFolder, tempFolder } from '../../../repositories';

suite('Watching the files compared', () => {
  let folder: string;
  let stops: (() => void)[];

  beforeEach(() => {
    folder = tempFolder('compare-watch');
    stops = [];
  });

  afterEach(() => {
    for (const stop of stops) {
      stop();
    }
    removeFolder(folder);
  });

  test('tells of a file compared written or replaced, but not of other files beside it', async () => {
    const watched = path.join(folder, 'watched.txt');
    fs.writeFileSync(watched, 'one');
    let changes = 0;
    stops.push(watchFiles([watched], () => changes++, 10));

    fs.writeFileSync(path.join(folder, 'other.txt'), 'other');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(changes, 0);

    fs.writeFileSync(path.join(folder, 'replacement.txt'), 'two');
    fs.renameSync(path.join(folder, 'replacement.txt'), watched);
    await waitFor(() => changes > 0, 'the replacement');
  });

  test('tells nothing once stopped', async () => {
    const watched = path.join(folder, 'watched.txt');
    fs.writeFileSync(watched, 'one');
    let changes = 0;
    watchFiles([watched], () => changes++, 10)();

    fs.writeFileSync(watched, 'two');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(changes, 0);
  });
});
