import * as assert from 'node:assert';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { listRemoteTags } from '../../../../../tools/git/main/cli/repository';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';

suite('Git remote tags', () => {
  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;

  beforeAll(async () => {
    folder = tempFolder('remote-tags');
    remote = await tempRepository(path.join(folder, 'remote'), { bare: true });
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a');
    await repository.commit('b');
    await repository.git('remote', 'add', 'origin', remote.root);
  });

  afterAll(() => removeFolder(folder));

  test("lists a remote's tags by the commit each points at, an annotated one by its commit rather than the tag object", async () => {
    const [a, b] = await repository.resolve('main~1', 'main');
    await repository.git('tag', 'light', a);
    await repository.git('tag', '-a', 'annotated', '-m', 'release', b);
    await repository.git('push', 'origin', 'main', '--tags');
    assert.deepStrictEqual(
      await listRemoteTags(repository.gitPath, repository.root, 'origin'),
      new Map([
        ['annotated', b],
        ['light', a],
      ]),
    );
  });

  test('lists no tags of a remote that has none', async () => {
    const empty = await tempRepository(path.join(folder, 'empty'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'empty', empty.root);
    try {
      assert.deepStrictEqual(
        await listRemoteTags(repository.gitPath, repository.root, 'empty'),
        new Map(),
      );
    } finally {
      await repository.git('remote', 'remove', 'empty');
    }
  });

  test('fails for a remote it cannot reach, rather than saying it has no tags', async () => {
    await repository.git('remote', 'add', 'gone', path.join(folder, 'nowhere'));
    try {
      await assert.rejects(
        listRemoteTags(repository.gitPath, repository.root, 'gone'),
      );
    } finally {
      await repository.git('remote', 'remove', 'gone');
    }
  });
});
