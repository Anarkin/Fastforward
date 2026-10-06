import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { listWorktrees, locateRepository } from '../git/worktrees';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

suite('Git worktrees', function () {
  this.timeout(20_000);
  let folder: string;
  let repository: TempRepository;
  let feature: string;
  let review: string;
  let gone: string;
  let head: string;

  suiteSetup(async () => {
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

  suiteTeardown(() => removeFolder(folder));

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

  test('finds no repository in a plain folder', async () => {
    const plain = path.join(folder, 'plain');
    fs.mkdirSync(plain);
    assert.strictEqual(
      await locateRepository(repository.gitPath, plain),
      undefined,
    );
  });
});
