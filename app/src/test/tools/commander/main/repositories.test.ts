import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  isRepository,
  repositoriesIn,
} from '../../../../tools/commander/main/repositories';
import { removeFolder, tempFolder } from '../../../repositories';

const gitFolder = (at: string, head = 'ref: refs/heads/main\n') => ({
  [`${at}/HEAD`]: head,
  [`${at}/objects`]: undefined,
  [`${at}/refs`]: undefined,
});

suite('Commander repositories', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('commander-repositories');
  });

  afterEach(() => {
    removeFolder(folder);
  });

  const made = (files: Record<string, string | undefined>) => {
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(folder, name);
      fs.mkdirSync(content === undefined ? file : path.dirname(file), {
        recursive: true,
      });
      if (content !== undefined) {
        fs.writeFileSync(file, content);
      }
    }
  };

  const at = (name: string) => isRepository(path.join(folder, name));

  test('is a repository with a .git folder or a .git file as worktrees and submodules have, never a bare one, as git is told to take no bare repository it was not named', async () => {
    made({
      ...gitFolder('cloned/.git'),
      ...gitFolder('main/.git'),
      'main/.git/worktrees/linked/HEAD': 'ref: refs/heads/other\n',
      'linked/.git': `gitdir: ${path.join(folder, 'main/.git/worktrees/linked')}\n`,
      ...gitFolder('parent/.git'),
      'parent/.git/modules/sub/HEAD':
        '0123456789abcdef0123456789abcdef01234567\n',
      'parent/sub/.git': 'gitdir: ../.git/modules/sub\n',
      ...gitFolder('bare.git'),
      ...gitFolder('detached/.git', `${'a'.repeat(64)}\n`),
      'headless/objects': undefined,
      'headless/refs': undefined,
      'plain/README.md': '',
    });

    for (const name of [
      'cloned',
      'main',
      'linked',
      'parent',
      'parent/sub',
      'detached',
    ]) {
      assert.strictEqual(await at(name), true, name);
    }
    for (const name of ['bare.git', 'headless', 'plain', 'gone']) {
      assert.strictEqual(await at(name), false, name);
    }
  });

  test('is no repository with a .git that git would not take: an empty folder, a file pointing nowhere or at no git folder, or a HEAD that names no ref or commit', async () => {
    made({
      'empty/.git': undefined,
      'stale/.git': `gitdir: ${path.join(folder, 'deleted/.git/worktrees/stale')}\n`,
      'pointless/.git': 'gitdir: ../plain\n',
      'plain/README.md': '',
      'unprefixed/.git': `${path.join(folder, 'cloned/.git')}\n`,
      ...gitFolder('cloned/.git'),
      ...gitFolder('garbled/.git', 'main\n'),
      ...gitFolder('garbled.git', 'ref: heads/main\n'),
    });

    for (const name of [
      'empty',
      'stale',
      'pointless',
      'unprefixed',
      'garbled',
      'garbled.git',
    ]) {
      assert.strictEqual(await at(name), false, name);
    }
  });

  test('names the folders that are repositories, in the order given, never the .git folder of the repository listed', async () => {
    const asked: string[] = [];
    const found = await repositoriesIn(
      '/code',
      ['one', '.git', 'two', 'three'],
      (each) => {
        asked.push(each);
        return Promise.resolve(!each.endsWith('two'));
      },
    );

    assert.deepStrictEqual(found, ['one', 'three']);
    assert.deepStrictEqual(asked.toSorted(), [
      path.join('/code', 'one'),
      path.join('/code', 'three'),
      path.join('/code', 'two'),
    ]);
  });

  test('looks at a few folders at a time, so a folder of thousands asks no more of the disk at once', async () => {
    let looking = 0;
    let most = 0;
    const names = Array.from({ length: 100 }, (_, index) => `folder${index}`);
    await repositoriesIn('/code', names, async () => {
      looking += 1;
      most = Math.max(most, looking);
      await new Promise((resolve) => setTimeout(resolve, 0));
      looking -= 1;
      return false;
    });

    assert.ok(most > 1 && most <= 16, `${most} at once`);
  });
});
