import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { listHistory } from '../git/history';
import { listStashes, stashFiles, stashPatch } from '../git/stashes';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

suite('Git stashes', function () {
  this.timeout(20_000);
  let folder: string;
  let temp: TempRepository;
  let base: string;

  suiteSetup(async () => {
    folder = tempFolder('stashes');
    temp = await tempRepository(path.join(folder, 'repository'));
    await temp.commit('base', { 'tracked.txt': 'one\n' });
    [base] = await temp.resolve('HEAD');
    fs.writeFileSync(path.join(temp.root, 'tracked.txt'), 'two\n');
    await temp.git('stash', 'push', '-q');
    fs.writeFileSync(path.join(temp.root, 'tracked.txt'), 'three\n');
    fs.writeFileSync(path.join(temp.root, 'new.txt'), 'new\n');
    await temp.git('stash', 'push', '-q', '-u', '-m', 'with new');
  });

  suiteTeardown(() => removeFolder(folder));

  test('lists the stashes newest first, with their messages and the commit of their untracked files', async () => {
    const stashes = await listStashes(temp.gitPath, temp.root);
    assert.deepStrictEqual(
      stashes.map(({ name, message, untracked }) => [
        name,
        message.replace(/ [0-9a-f]+ /, ' '),
        untracked !== undefined,
      ]),
      [
        ['stash@{0}', 'On main: with new', true],
        ['stash@{1}', 'WIP on main: base', false],
      ],
    );
  });

  test('lists no stashes in a repository without any', async () => {
    const empty = await tempRepository(path.join(folder, 'empty'));
    assert.deepStrictEqual(await listStashes(empty.gitPath, empty.root), []);
  });

  test('puts each stash on its base in the history, without the commits of its index and untracked files, and none when solo', async () => {
    const stashes = (await listStashes(temp.gitPath, temp.root)).map(
      (stash) => stash.commit,
    );
    const history = await listHistory(temp.gitPath, temp.root, false, stashes);
    assert.deepStrictEqual(
      new Map(history.map((entry) => [entry.hash, entry.parents])),
      new Map([
        [stashes[0], [base]],
        [stashes[1], [base]],
        [base, []],
      ]),
    );
    assert.deepStrictEqual(
      await listHistory(temp.gitPath, temp.root, true, stashes),
      [{ hash: base, parents: [] }],
    );
  });

  test('lists the files and patch of a stash, its untracked files with them', async () => {
    const [stash] = await listStashes(temp.gitPath, temp.root);
    const files = await stashFiles(temp.gitPath, temp.root, stash);
    assert.deepStrictEqual(
      files.map((file) => [file.path, file.status]),
      [
        ['tracked.txt', 'M'],
        ['new.txt', 'U'],
      ],
    );
    const patch = await stashPatch(temp.gitPath, temp.root, stash);
    assert.match(patch, /^diff --git a\/tracked\.txt b\/tracked\.txt$/m);
    assert.match(patch, /^\+three$/m);
    assert.match(patch, /^diff --git a\/new\.txt b\/new\.txt$/m);
    const one = await stashPatch(temp.gitPath, temp.root, stash, {
      path: 'new.txt',
    });
    assert.match(one, /^\+new$/m);
    assert.doesNotMatch(one, /tracked\.txt/);
  });
});
