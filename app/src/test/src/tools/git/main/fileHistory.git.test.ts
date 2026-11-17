import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { fileHistory } from '../../../../../tools/git/main/fileHistory';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('File history', () => {
  let parent: string;
  let repository: TempRepository;
  const at = (file: string) => path.join(repository.root, file);

  beforeAll(async () => {
    parent = tempFolder('history');
    repository = await tempRepository(path.join(parent, 'repository'));
    await repository.commit('one', { 'a.txt': 'one\n', 'c.txt': 'c\n' });
    await repository.commit('two', { 'a.txt': 'two\n' });
    await repository.git('mv', 'a.txt', 'b.txt');
    await repository.git('commit', '-m', 'three');
    await repository.commit('four', { 'other.txt': 'other\n' });
    await repository.git('rm', 'c.txt');
    await repository.git('commit', '-m', 'five');
  });

  afterAll(() => removeFolder(parent));

  test('lists the commits that changed a file, newest first, following it to the names it had, each with the path it had then, its date and its subject', async () => {
    const [one, two, three] = await repository.resolve(
      'HEAD~4',
      'HEAD~3',
      'HEAD~2',
    );
    const history = await fileHistory(repository.gitPath, at('b.txt'));
    assert.deepStrictEqual(
      history?.versions.map((version) => [
        version.rev,
        version.path,
        version.subject,
        version.gone,
      ]),
      [
        [three, at('b.txt'), 'three', false],
        [two, at('a.txt'), 'two', false],
        [one, at('a.txt'), 'one', false],
      ],
    );
    assert.ok(
      history.versions.every(
        (version) => Number.isInteger(version.date) && version.date > 0,
      ),
    );
    assert.deepStrictEqual([history.staged, history.changed], [false, false]);
  });

  test('marks the commit that deleted a file, as it has no version of it', async () => {
    const [one, five] = await repository.resolve('HEAD~4', 'HEAD');
    const history = await fileHistory(repository.gitPath, at('c.txt'));
    assert.deepStrictEqual(
      history?.versions.map((version) => [version.rev, version.gone]),
      [
        [five, true],
        [one, false],
      ],
    );
  });

  test('says the file on disk differs from the newest version it lists once it does, and the index holds a version of its own only while that differs from both HEAD and the disk', async () => {
    const staging = await tempRepository(path.join(parent, 'staging'));
    await staging.commit('one', { 'a.txt': 'one\n' });
    const file = path.join(staging.root, 'a.txt');
    const told = async () => {
      const history = await fileHistory(staging.gitPath, file);
      return [history?.changed, history?.staged];
    };

    assert.deepStrictEqual(await told(), [false, false]);
    fs.writeFileSync(file, 'staged\n');
    await staging.git('add', 'a.txt');
    assert.deepStrictEqual(await told(), [true, false]);
    fs.writeFileSync(file, 'working\n');
    assert.deepStrictEqual(await told(), [true, true]);
    fs.writeFileSync(file, 'one\n');
    assert.deepStrictEqual(await told(), [false, true]);
  });

  test('lists no versions of a file git does not track, and gives no history outside a repository', async () => {
    fs.writeFileSync(at('new.txt'), 'new\n');
    assert.deepStrictEqual(
      await fileHistory(repository.gitPath, at('new.txt')),
      { versions: [], staged: false, changed: true },
    );
    assert.strictEqual(
      await fileHistory(repository.gitPath, path.join(parent, 'outside.txt')),
      undefined,
    );
  });
});
