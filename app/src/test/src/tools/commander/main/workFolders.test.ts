import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  markCopy,
  workFolders,
} from '../../../../../tools/commander/main/workFolders';
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

  test('keeps the copy of a file of an archive opened in another app as it quits, as the app may still save into it, and on the next start deletes it only while it is as it was put back or taken out, keeping one changed since and telling of it once, after a crash too', async () => {
    const root = path.join(folder, 'archives');
    const alive = new Set<number>([200]);
    const ours = workFolders(root, 200, (pid) => alive.has(pid));
    const plain = await ours.next();
    const [same, changed] = await Promise.all([ours.next(), ours.next()]);
    const copyIn = async (work: string, text: string) => {
      const copy = path.join(work, 'notes.txt');
      fs.writeFileSync(copy, text);
      await markCopy(work, copy, path.join(folder, 'a.zip'), 'docs/notes.txt');
      return copy;
    };
    await copyIn(same, 'as taken out');
    const edited = await copyIn(changed, 'as taken out');

    await ours.clear();
    assert.deepStrictEqual(
      [plain, same, changed].map((each) => fs.existsSync(each)),
      [false, true, true],
    );
    fs.writeFileSync(edited, 'saved after the app quit, a longer text');
    alive.delete(200);
    const next = workFolders(root, 300, (pid) => alive.has(pid));

    assert.deepStrictEqual(await next.clearEnded(), [
      {
        copy: edited,
        archive: path.join(folder, 'a.zip'),
        name: 'docs/notes.txt',
      },
    ]);
    assert.deepStrictEqual(
      [same, changed].map((each) => fs.existsSync(each)),
      [false, true],
    );
    assert.deepStrictEqual(await next.clearEnded(), []);
    assert.ok(fs.existsSync(edited));
  });

  test('keeps the copy of a file from a subfolder of an archive, taken out with its folders, as it keeps one from the root, as its mark beside it was never read and the copy was deleted at quit', async () => {
    const root = path.join(folder, 'archives');
    const alive = new Set<number>([200]);
    const ours = workFolders(root, 200, (pid) => alive.has(pid));
    const work = await ours.next();
    fs.mkdirSync(path.join(work, 'docs'));
    const copy = path.join(work, 'docs', 'notes.txt');
    fs.writeFileSync(copy, 'as taken out');
    await markCopy(work, copy, path.join(folder, 'a.zip'), 'docs/notes.txt');

    await ours.clear();
    assert.ok(fs.existsSync(copy));
    fs.writeFileSync(copy, 'saved after the app quit, a longer text');
    alive.delete(200);

    assert.deepStrictEqual(
      await workFolders(root, 300, (pid) => alive.has(pid)).clearEnded(),
      [{ copy, archive: path.join(folder, 'a.zip'), name: 'docs/notes.txt' }],
    );
    assert.ok(fs.existsSync(copy));
  });
});
