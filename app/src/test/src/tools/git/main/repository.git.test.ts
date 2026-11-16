import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { repositoryRoot } from '../../../../../tools/git/main/repository';
import { gitErrorText } from '../../../../../lib/main/errorText';
import { renamingRepository } from '../../../../helpers/gitFixtures';
import {
  asIfOwnedByAnother,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Git repository', () => {
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;

  beforeAll(async () => {
    ({ temp } = await renamingRepository('repository'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  afterAll(() => removeFolder(cwd));

  test('finds the root of the repository a folder is in, spelled the way the folder was given, or none', async () => {
    fs.mkdirSync(path.join(cwd, 'inner'), { recursive: true });
    assert.strictEqual(
      await repositoryRoot(gitPath, path.join(cwd, 'inner')),
      path.resolve(cwd),
    );
    const outside = tempFolder('outside');
    try {
      const link = path.join(outside, 'link');
      fs.symlinkSync(cwd, link, 'junction');
      assert.strictEqual(
        await repositoryRoot(gitPath, path.join(link, 'inner')),
        link,
      );
      assert.strictEqual(await repositoryRoot(gitPath, outside), undefined);
    } finally {
      removeFolder(outside);
    }
  });

  test('finds the root of the repository a folder is in through a link to it, which git follows before going up', async () => {
    fs.mkdirSync(path.join(cwd, 'sub', 'deep'), { recursive: true });
    const outside = tempFolder('link');
    try {
      const link = path.join(outside, 'link');
      fs.symlinkSync(path.join(cwd, 'sub', 'deep'), link, 'junction');
      const root = await repositoryRoot(gitPath, link);
      assert.ok(root !== undefined);
      assert.strictEqual(
        fs.realpathSync.native(root),
        fs.realpathSync.native(cwd),
      );
    } finally {
      removeFolder(outside);
    }
  });

  test('finds no root in a folder that is gone', async () => {
    const gone = tempFolder('gone');
    removeFolder(gone);
    assert.strictEqual(await repositoryRoot(gitPath, gone), undefined);
  });

  test('says what git said when it refuses a repository, not that there is none', async () => {
    await asIfOwnedByAnother(cwd, () =>
      assert.rejects(repositoryRoot(gitPath, cwd), (error) => {
        assert.match(gitErrorText(error), /^fatal: detected dubious ownership/);
        return true;
      }),
    );
  });

  test('finds no root in a bare repository or a git folder, which have no working tree', async () => {
    const bare = await tempRepository(tempFolder('bare'), { bare: true });
    try {
      assert.strictEqual(await repositoryRoot(gitPath, bare.root), undefined);
      assert.strictEqual(
        await repositoryRoot(gitPath, path.join(cwd, '.git')),
        undefined,
      );
    } finally {
      removeFolder(bare.root);
    }
  });
});
