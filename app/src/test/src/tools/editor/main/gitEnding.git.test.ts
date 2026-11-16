import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { gitEndingOf } from '../../../../../tools/editor/main/gitEnding';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { withEnv } from '../../../../helpers/env';

suite('Line endings git gives a new file', () => {
  let folder: string;
  let repository: TempRepository;

  beforeEach(async () => {
    folder = tempFolder('git-ending');
    repository = await tempRepository(path.join(folder, 'repo'));
  });

  afterEach(() => {
    removeFolder(folder);
  });

  test('takes the eol attribute of the path, by the .gitattributes of the repository, over the config', async () => {
    fs.writeFileSync(
      path.join(repository.root, '.gitattributes'),
      '* text=auto eol=lf\n*.cmd text eol=crlf\n',
    );
    await repository.git('config', 'core.autocrlf', 'true');
    const at = (name: string) => path.join(repository.root, name);
    assert.deepStrictEqual(await gitEndingOf(repository.gitPath, at('a.ts')), {
      ending: 'lf',
      by: 'eol',
    });
    assert.deepStrictEqual(
      await gitEndingOf(repository.gitPath, at('run.cmd')),
      { ending: 'crlf', by: 'eol' },
    );
  });

  test('takes core.autocrlf, then core.eol, where no attribute says, and nothing for a path not text or outside a repository', async () => {
    const file = path.join(repository.root, 'a.txt');
    await repository.git('config', 'core.autocrlf', 'true');
    assert.deepStrictEqual(await gitEndingOf(repository.gitPath, file), {
      ending: 'crlf',
      by: 'core.autocrlf',
    });
    await repository.git('config', 'core.autocrlf', 'input');
    assert.deepStrictEqual(await gitEndingOf(repository.gitPath, file), {
      ending: 'lf',
      by: 'core.autocrlf',
    });
    await repository.git('config', 'core.autocrlf', 'false');
    await repository.git('config', 'core.eol', 'crlf');
    assert.deepStrictEqual(await gitEndingOf(repository.gitPath, file), {
      ending: 'crlf',
      by: 'core.eol',
    });
    fs.writeFileSync(
      path.join(repository.root, '.gitattributes'),
      '*.bin -text\n',
    );
    assert.strictEqual(
      await gitEndingOf(
        repository.gitPath,
        path.join(repository.root, 'a.bin'),
      ),
      undefined,
    );
    const outside = tempFolder('git-ending-outside');
    try {
      assert.strictEqual(
        await gitEndingOf(repository.gitPath, path.join(outside, 'a.txt')),
        undefined,
      );
    } finally {
      removeFolder(outside);
    }
  });

  test('reads the repository of the file, though the environment names another', async () => {
    const other = await tempRepository(path.join(folder, 'other'));
    await other.git('config', 'core.autocrlf', 'true');
    await repository.git('config', 'core.autocrlf', 'input');
    await withEnv(
      { GIT_DIR: path.join(other.root, '.git'), GIT_WORK_TREE: other.root },
      async () => {
        assert.deepStrictEqual(
          await gitEndingOf(
            repository.gitPath,
            path.join(repository.root, 'a.txt'),
          ),
          { ending: 'lf', by: 'core.autocrlf' },
        );
      },
    );
  });

  test('takes no bare repository it was not named, as a folder inside a cloned repository can be one whose config makes git run its commands', async () => {
    const bare = await tempRepository(path.join(folder, 'bare'), {
      bare: true,
    });
    await bare.git('config', 'core.autocrlf', 'true');
    assert.strictEqual(
      await gitEndingOf(repository.gitPath, path.join(bare.root, 'a.txt')),
      undefined,
    );
  });
});
