import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  aheadBehind,
  readUpstream,
  remoteDefaultBranches,
} from '../../git/branches';
import { renamingRepository } from '../gitFixtures';
import { removeFolder, type TempRepository } from '../repositories';

suite('Git branches', () => {
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;

  beforeAll(async () => {
    ({ temp } = await renamingRepository('branches'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  afterAll(() => removeFolder(cwd));

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
        remote: 'origin',
        remoteRef: 'refs/heads/main',
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

  test('reads an upstream on a remote under another name, and one that is a local branch', async () => {
    await temp.git('remote', 'add', 'origin', 'https://example.com/x.git');
    await temp.git('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
    const [head] = await temp.resolve('HEAD');
    try {
      await temp.git('branch', '--set-upstream-to=origin/trunk');
      assert.deepStrictEqual(await readUpstream(gitPath, cwd), {
        kind: 'found',
        branch: 'main',
        name: 'origin/trunk',
        commit: head,
        remote: 'origin',
        remoteRef: 'refs/heads/trunk',
      });
      await temp.git('switch', '-q', '-c', 'follower', '--track', 'main');
      assert.deepStrictEqual(await readUpstream(gitPath, cwd), {
        kind: 'found',
        branch: 'follower',
        name: 'main',
        commit: head,
        remote: '.',
        remoteRef: 'refs/heads/main',
      });
    } finally {
      await temp.git('switch', '-q', 'main');
      await temp.git('branch', '-D', 'follower');
      await temp.git('branch', '--unset-upstream');
      await temp.git('remote', 'remove', 'origin');
    }
  });

  test('reads the upstream of a branch named, wherever HEAD is, and none for a branch without one', async () => {
    await temp.git('remote', 'add', 'origin', 'https://example.com/x.git');
    await temp.git('update-ref', 'refs/remotes/origin/side', 'HEAD~1');
    const [behind] = await temp.resolve('HEAD~1');
    await temp.git('branch', 'side', 'HEAD');
    await temp.git('branch', '--set-upstream-to=origin/side', 'side');
    await temp.git('branch', 'alone', 'HEAD');
    await temp.git('switch', '-q', '--detach');
    try {
      assert.deepStrictEqual(await readUpstream(gitPath, cwd, 'side'), {
        kind: 'found',
        branch: 'side',
        name: 'origin/side',
        commit: behind,
        remote: 'origin',
        remoteRef: 'refs/heads/side',
      });
      assert.deepStrictEqual(await readUpstream(gitPath, cwd, 'alone'), {
        kind: 'none',
        branch: 'alone',
      });
    } finally {
      await temp.git('switch', '-q', 'main');
      await temp.git('branch', '-D', 'side', 'alone');
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

  test('reads the default branch of a remote with a slash in its name', async () => {
    await temp.git('update-ref', 'refs/remotes/team/fork/develop', 'HEAD');
    try {
      await temp.git(
        'symbolic-ref',
        'refs/remotes/team/fork/HEAD',
        'refs/remotes/team/fork/develop',
      );
      assert.deepStrictEqual(await remoteDefaultBranches(gitPath, cwd), [
        'team/fork/develop',
      ]);
    } finally {
      await temp.git('symbolic-ref', '-d', 'refs/remotes/team/fork/HEAD');
      await temp.git('update-ref', '-d', 'refs/remotes/team/fork/develop');
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

  test('fails to count the commits of a branch git cannot read, rather than taking it to be up to date', async () => {
    const broken = path.join(
      cwd,
      '.git',
      'refs',
      'remotes',
      'origin',
      'broken',
    );
    fs.mkdirSync(path.dirname(broken), { recursive: true });
    fs.writeFileSync(broken, `${'a'.repeat(40)}\n`);
    try {
      await assert.rejects(
        aheadBehind(
          gitPath,
          cwd,
          'refs/heads/main',
          'refs/remotes/origin/broken',
        ),
      );
    } finally {
      fs.rmSync(broken);
    }
  });
});
