import * as assert from 'node:assert';
import {
  aheadBehind,
  readUpstream,
  remoteDefaultBranches,
} from '../../git/branches';
import { renamingRepository } from '../gitFixtures';
import { removeFolder, type TempRepository } from '../repositories';

suite('Git branches', function () {
  this.timeout(20_000);
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;

  suiteSetup(async () => {
    ({ temp } = await renamingRepository('branches'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  suiteTeardown(() => removeFolder(cwd));

  test('reads the upstream of the checked-out branch, or why it has none', async () => {
    await temp.git('remote', 'add', 'origin', 'https://example.com/x.git');
    await temp.git('update-ref', 'refs/remotes/origin/main', 'HEAD~1');
    const [behind] = await temp.resolve('HEAD~1');
    try {
      assert.deepStrictEqual(await readUpstream(gitPath, cwd), {
        kind: 'none',
        branch: 'main',
      });
      await temp.git('branch', '--set-upstream-to=origin/main');
      assert.deepStrictEqual(await readUpstream(gitPath, cwd), {
        kind: 'found',
        branch: 'main',
        name: 'origin/main',
        commit: behind,
      });
      await temp.git('update-ref', '-d', 'refs/remotes/origin/main');
      assert.deepStrictEqual(await readUpstream(gitPath, cwd), {
        kind: 'gone',
        branch: 'main',
        name: 'origin/main',
      });
      await temp.git('switch', '-q', '--detach');
      assert.deepStrictEqual(await readUpstream(gitPath, cwd), {
        kind: 'detached',
      });
    } finally {
      await temp.git('switch', '-q', 'main');
      await temp.git('remote', 'remove', 'origin');
    }
  });

  test("reads a remote's default branch", async () => {
    assert.deepStrictEqual(await remoteDefaultBranches(gitPath, cwd), []);
    await temp.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    try {
      await temp.git(
        'symbolic-ref',
        'refs/remotes/origin/HEAD',
        'refs/remotes/origin/main',
      );
      assert.deepStrictEqual(await remoteDefaultBranches(gitPath, cwd), [
        'origin/main',
      ]);
      await temp.git('update-ref', 'refs/remotes/up/HEAD', 'HEAD');
      assert.deepStrictEqual(await remoteDefaultBranches(gitPath, cwd), [
        'origin/main',
      ]);
    } finally {
      await temp.git('update-ref', '-d', 'refs/remotes/origin/main');
      await temp.git('symbolic-ref', '-d', 'refs/remotes/origin/HEAD');
      await temp.git('update-ref', '-d', 'refs/remotes/up/HEAD');
    }
  });

  test('counts the commits a branch is ahead and behind another', async () => {
    const [tree] = await temp.resolve('HEAD^{tree}');
    const extra = (
      await temp.git('commit-tree', tree, '-p', 'HEAD', '-m', 'extra')
    ).trim();
    await temp.git('update-ref', 'refs/remotes/origin/main', extra);
    try {
      assert.deepStrictEqual(
        await aheadBehind(
          gitPath,
          cwd,
          'refs/remotes/origin/main',
          'refs/heads/main',
        ),
        { ahead: 1, behind: 0 },
      );
      assert.deepStrictEqual(
        await aheadBehind(
          gitPath,
          cwd,
          'refs/heads/main',
          'refs/remotes/origin/main',
        ),
        { ahead: 0, behind: 1 },
      );
      assert.deepStrictEqual(
        await aheadBehind(
          gitPath,
          cwd,
          'refs/heads/nope',
          'refs/remotes/origin/main',
        ),
        { ahead: 0, behind: 0 },
      );
    } finally {
      await temp.git('update-ref', '-d', 'refs/remotes/origin/main');
    }
  });
});
