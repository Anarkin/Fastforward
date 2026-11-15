import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { workFolders } from '../../../../../tools/commander/main/workFolders';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('The work folders of archives', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('work-folders');
  });

  afterEach(() => {
    removeFolder(folder);
  });

  test('keeps the work folders of each run of the app apart, clearing its own as it quits and those of runs ended as it starts, but none of a run still quitting, as a quitting run deleted what the next took out', async () => {
    const root = path.join(folder, 'archives');
    const alive = new Set([100, 200]);
    const ours = workFolders(root, 200, (pid) => alive.has(pid));
    const quitting = workFolders(root, 100, (pid) => alive.has(pid));
    const ended = workFolders(root, 300, (pid) => alive.has(pid));
    const [mine, theirs, gone] = await Promise.all(
      [ours, quitting, ended].map((each) => each.next()),
    );
    fs.mkdirSync(path.join(root, 'not a run'));

    await ours.clearEnded();
    assert.deepStrictEqual(
      [mine, theirs, gone].map((each) => fs.existsSync(each)),
      [true, true, false],
    );
    await ours.clear();
    assert.deepStrictEqual(
      [mine, theirs].map((each) => fs.existsSync(each)),
      [false, true],
    );
    assert.ok(fs.existsSync(path.join(root, 'not a run')));
  });
});
