import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { named } from '../../../../../lib/shared/sentences';
import { GitLocator, needsGit } from '../../../../../tools/git/main/gitLocator';
import { findGit, type GitSearch } from '../../../../../tools/git/main/locate';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

const gitPath = path.join(os.tmpdir(), 'fastforward-found', 'git');
const found: GitSearch = { kind: 'found', path: gitPath, version: '2.52.0' };
const tooOld: GitSearch = {
  kind: 'tooOld',
  path: gitPath,
  version: '2.51.2',
};

function searching(...results: GitSearch[]) {
  const asked: number[] = [];
  const search = () => {
    asked.push(asked.length + 1);
    return Promise.resolve<GitSearch>(results.shift() ?? { kind: 'missing' });
  };
  return { asked, search };
}

suite('Locating git', () => {
  test('looks for git again each time it is asked while git is missing, and no more once found, keeping it', async () => {
    const { asked, search } = searching({ kind: 'missing' }, tooOld, found);
    const locator = new GitLocator({ kind: 'missing' }, search);

    assert.deepStrictEqual(await locator.located(), { kind: 'missing' });
    assert.deepStrictEqual(await locator.located(), tooOld);
    assert.strictEqual(locator.path, undefined);
    assert.deepStrictEqual(await locator.located(), found);
    assert.deepStrictEqual(await locator.located(), found);
    assert.deepStrictEqual(await locator.located(), found);

    assert.deepStrictEqual(asked, [1, 2, 3]);
    assert.strictEqual(locator.path, gitPath);
  });

  test('never looks again for the git found when the app started', async () => {
    const { asked, search } = searching();
    const locator = new GitLocator(found, search);

    assert.deepStrictEqual(await locator.located(), found);
    assert.strictEqual(locator.path, gitPath);
    assert.deepStrictEqual(asked, []);
  });

  test('looks once for those who ask while it is looking', async () => {
    const { asked, search } = searching(found);
    const locator = new GitLocator({ kind: 'missing' }, search);

    const all = await Promise.all([
      locator.located(),
      locator.located(),
      locator.located(),
    ]);

    assert.deepStrictEqual(all, [found, found, found]);
    assert.deepStrictEqual(asked, [1]);
  });

  test('tells those waiting for git once, when it is found', async () => {
    const { search } = searching({ kind: 'missing' }, found);
    const locator = new GitLocator({ kind: 'missing' }, search);
    const told: GitSearch[] = [];
    locator.whenFound((git) => told.push(git));

    await locator.located();
    assert.deepStrictEqual(told, []);
    await locator.located();
    await locator.located();

    assert.deepStrictEqual(told, [found]);
  });

  test('takes a search that fails for git missing, looking again the next time', async () => {
    let failing = true;
    const locator = new GitLocator({ kind: 'missing' }, () =>
      failing
        ? Promise.reject(new Error('EACCES'))
        : Promise.resolve<GitSearch>(found),
    );

    assert.deepStrictEqual(await locator.located(), { kind: 'missing' });
    failing = false;
    assert.deepStrictEqual(await locator.located(), found);
  });

  test('finds no git on a PATH without it', async () => {
    const folder = tempFolder('no-git');
    try {
      const locator = new GitLocator({ kind: 'missing' }, () =>
        findGit({ PATH: folder }),
      );
      assert.deepStrictEqual(await locator.located(), { kind: 'missing' });
    } finally {
      removeFolder(folder);
    }
  });

  test('says the git tool needs git, and the version it needs, or names the git too old and where it is', () => {
    assert.deepStrictEqual(
      needsGit({ kind: 'missing' }),
      strings.app.needsGit(strings.app.installGit('2.52')),
    );
    assert.deepStrictEqual(
      needsGit(tooOld),
      strings.app.needsGit(strings.app.gitTooOld('2.51.2', gitPath, '2.52')),
    );
    assert.deepStrictEqual(strings.app.gitTooOld('2.51.2', gitPath, '2.52'), [
      'Git 2.51.2 at ',
      named(gitPath),
      ' is too old. Install git 2.52 or later, then try again.',
    ]);
  });

  test('refuses to give a path to run while git is missing, saying why', async () => {
    const locator = new GitLocator(tooOld, () => Promise.resolve(found));

    assert.throws(
      () => locator.pathToRun(),
      new Error(
        `The git tool needs git. Git 2.51.2 at "${gitPath}" is too old. Install git 2.52 or later, then try again.`,
      ),
    );
    await locator.located();
    assert.strictEqual(locator.pathToRun(), gitPath);
  });
});
