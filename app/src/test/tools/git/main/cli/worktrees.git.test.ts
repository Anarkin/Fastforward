import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  listWorktrees,
  locateRepository,
} from '../../../../../tools/git/main/cli/worktrees';
import {
  removeFolder,
  savedEnv,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';

async function submoduleWithLinkedWorktree(where: string) {
  const superproject = await tempRepository(path.join(where, 'super'));
  const library = await tempRepository(path.join(where, 'library'));
  await library.commit('library');
  await superproject.git(
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'add',
    '-q',
    library.root,
    'lib',
  );
  const lib = path.join(superproject.root, 'lib');
  const linked = path.join(where, 'lib.worktrees', 'linked');
  await superproject.git(
    '-C',
    lib,
    'worktree',
    'add',
    '-q',
    '--detach',
    linked,
  );
  return { lib, linked };
}

suite('Git worktrees', () => {
  let folder: string;
  let repository: TempRepository;
  let feature: string;
  let review: string;
  let gone: string;
  let head: string;

  beforeAll(async () => {
    folder = tempFolder('worktrees');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('first');
    [head] = await repository.resolve('HEAD');
    feature = path.join(folder, 'app.worktrees', 'feature');
    review = path.join(folder, 'app.worktrees', 'review');
    gone = path.join(folder, 'app.worktrees', 'gone');
    await repository.git('worktree', 'add', '-q', '-b', 'feature', feature);
    await repository.git('worktree', 'add', '-q', '--detach', review);
    await repository.git('worktree', 'add', '-q', '-b', 'gone', gone);
    await repository.git('worktree', 'lock', gone);
    fs.rmSync(gone, { recursive: true, force: true });
  });

  afterAll(() => removeFolder(folder));

  let links = 0;
  const linkTo = (target: string) => {
    const link = path.join(folder, 'links', String(links++));
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, 'junction');
    return link;
  };

  test('lists the worktrees of a repository from any of them, the main one first and the rest by folder, keeping the spelling of the folders known', async () => {
    for (const cwd of [repository.root, review]) {
      const worktrees = await listWorktrees(repository.gitPath, cwd, [
        repository.root,
        feature,
        review,
      ]);
      assert.deepStrictEqual(
        worktrees.map(({ path: root, branch, head: commit, missing }) => ({
          name: path.basename(root),
          branch,
          commit,
          missing,
        })),
        [
          { name: 'app', branch: 'main', commit: head, missing: false },
          { name: 'feature', branch: 'feature', commit: head, missing: false },
          { name: 'gone', branch: 'gone', commit: head, missing: true },
          { name: 'review', branch: undefined, commit: head, missing: false },
        ],
      );
      assert.deepStrictEqual(
        [worktrees[0].path, worktrees[1].path, worktrees[3].path],
        [repository.root, feature, review],
      );
    }
    const known = [repository.root, feature, review].map(linkTo);
    const linked = await listWorktrees(
      repository.gitPath,
      repository.root,
      known,
    );
    assert.deepStrictEqual(
      [linked[0].path, linked[1].path, linked[3].path],
      known,
    );
  });

  test('finds the repository of a folder in a worktree', async () => {
    const inner = path.join(feature, 'inner');
    fs.mkdirSync(inner, { recursive: true });
    const location = await locateRepository(repository.gitPath, inner);
    assert.ok(location);
    assert.strictEqual(
      fs.realpathSync.native(location.repository),
      fs.realpathSync.native(repository.root),
    );
    assert.strictEqual(location.worktree, feature);
    assert.strictEqual(location.worktrees[1].path, feature);
  });

  test('names the main worktree as the repository the way its folder was given', async () => {
    const location = await locateRepository(
      repository.gitPath,
      repository.root,
    );
    assert.strictEqual(location?.repository, repository.root);
    assert.strictEqual(location.worktree, repository.root);
    const link = linkTo(repository.root);
    const linked = await locateRepository(repository.gitPath, link);
    assert.strictEqual(linked?.repository, link);
    assert.strictEqual(linked.worktree, link);
  });

  test('finds a bare repository with worktrees beside it, also by the folder that holds them', async () => {
    const layout = path.join(folder, 'bare-layout');
    const bare = await tempRepository(path.join(layout, '.bare'), {
      bare: true,
    });
    fs.writeFileSync(path.join(layout, '.git'), 'gitdir: ./.bare\n');
    await repository.git('push', '-q', bare.root, 'main');
    const main = path.join(layout, 'main');
    await bare.git('worktree', 'add', '-q', main, 'main');
    for (const opened of [layout, bare.root]) {
      const location = await locateRepository(repository.gitPath, opened);
      assert.ok(location, opened);
      assert.strictEqual(
        fs.realpathSync.native(location.repository),
        fs.realpathSync.native(bare.root),
      );
      assert.strictEqual(location.worktree, undefined);
      assert.deepStrictEqual(
        location.worktrees.map((worktree) => worktree.bare),
        [true, false],
      );
    }
    const location = await locateRepository(repository.gitPath, main);
    assert.strictEqual(location?.worktree, main);
    assert.ok(location.worktrees[0].bare);
  });

  test('names the work tree of a repository whose git folder is elsewhere as the repository and its main worktree', async () => {
    const separate = path.join(folder, 'separate');
    const work = path.join(separate, 'work');
    await repository.git(
      'clone',
      '-q',
      '--separate-git-dir',
      path.join(separate, 'store.git'),
      repository.root,
      work,
    );
    const location = await locateRepository(repository.gitPath, work);
    assert.strictEqual(location?.repository, work);
    assert.strictEqual(location.worktrees[0].path, work);
    assert.strictEqual(
      (await locateRepository(repository.gitPath, location.repository))
        ?.repository,
      work,
    );
  });

  test('lists the main worktree of a repository whose git folder is elsewhere as missing from a linked worktree, as git does not know where it is, naming the git folder as the repository, which opens again, but not from the main worktree', async () => {
    const separate = path.join(folder, 'separate-linked');
    const work = path.join(separate, 'work');
    const store = path.join(separate, 'store.git');
    const linked = path.join(separate, 'linked');
    await repository.git(
      'clone',
      '-q',
      '--separate-git-dir',
      store,
      repository.root,
      work,
    );
    await repository.git('-C', work, 'worktree', 'add', '-q', linked);
    const fromLinked = await locateRepository(repository.gitPath, linked);
    assert.ok(fromLinked);
    const reopened = await locateRepository(
      repository.gitPath,
      fromLinked.repository,
    );
    assert.strictEqual(reopened?.repository, fromLinked.repository);
    for (const worktrees of [
      fromLinked.worktrees,
      reopened.worktrees,
      await listWorktrees(repository.gitPath, fromLinked.repository),
    ]) {
      assert.deepStrictEqual(
        worktrees.map((worktree) => [
          fs.realpathSync.native(worktree.path),
          worktree.missing,
        ]),
        [
          [fs.realpathSync.native(store), true],
          [fs.realpathSync.native(linked), false],
        ],
      );
    }
    const fromWork = await locateRepository(repository.gitPath, work);
    assert.strictEqual(fromWork?.repository, work);
    for (const worktrees of [
      fromWork.worktrees,
      await listWorktrees(repository.gitPath, work),
    ]) {
      assert.deepStrictEqual(
        worktrees.map((worktree) => worktree.missing),
        [false, false],
      );
    }
  });

  test('finds a bare repository with worktrees beside it and lists them, by its folder too, where git works with a bare repository only when told it is one', async () => {
    const layout = path.join(folder, 'explicit-layout');
    const bare = await tempRepository(path.join(layout, '.bare'), {
      bare: true,
    });
    await repository.git('push', '-q', bare.root, 'main');
    const main = path.join(layout, 'main');
    await bare.git('worktree', 'add', '-q', main, 'main');
    const restoreEnv = savedEnv([
      'GIT_CONFIG_COUNT',
      'GIT_CONFIG_KEY_0',
      'GIT_CONFIG_VALUE_0',
    ]);
    Object.assign(process.env, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.bareRepository',
      GIT_CONFIG_VALUE_0: 'explicit',
    });
    try {
      const fromMain = await locateRepository(repository.gitPath, main);
      assert.ok(fromMain);
      const reopened = await locateRepository(
        repository.gitPath,
        fromMain.repository,
      );
      assert.strictEqual(reopened?.repository, fromMain.repository);
      for (const worktrees of [
        fromMain.worktrees,
        reopened.worktrees,
        await listWorktrees(repository.gitPath, fromMain.repository),
      ]) {
        assert.deepStrictEqual(
          worktrees.map((worktree) => worktree.bare),
          [true, false],
        );
      }
    } finally {
      restoreEnv();
    }
  });

  test('names the work tree of a submodule as its main worktree from a linked worktree of it too, as the submodule records it', async () => {
    const { lib, linked } = await submoduleWithLinkedWorktree(folder);
    const fromMain = await locateRepository(repository.gitPath, lib);
    const fromLinked = await locateRepository(repository.gitPath, linked);
    assert.strictEqual(fromMain?.repository, lib);
    assert.strictEqual(fromLinked?.repository, lib);
    assert.deepStrictEqual(
      fromLinked.worktrees.map((worktree) => worktree.path),
      [lib, linked],
    );
  });

  test('names the work tree of a submodule from a linked worktree of it reached through a link as spelled through the link, as git names it by its real folder, as macOS links its temporary folders', async () => {
    const real = path.join(folder, 'through-link');
    fs.mkdirSync(real);
    await submoduleWithLinkedWorktree(real);
    const spelled = linkTo(real);
    const lib = path.join(spelled, 'super', 'lib');
    const linked = path.join(spelled, 'lib.worktrees', 'linked');
    const fromLinked = await locateRepository(repository.gitPath, linked);
    assert.strictEqual(fromLinked?.repository, lib);
    assert.deepStrictEqual(
      fromLinked.worktrees.map((worktree) => worktree.path),
      [lib, linked],
    );
  });

  test('finds no repository in a plain folder', async () => {
    const plain = path.join(folder, 'plain');
    fs.mkdirSync(plain);
    assert.strictEqual(
      await locateRepository(repository.gitPath, plain),
      undefined,
    );
  });
});
