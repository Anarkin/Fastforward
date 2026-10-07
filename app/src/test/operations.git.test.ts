import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkout } from '../operations';
import type { CheckoutTarget } from '../shared/protocol';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';

interface CheckedOut {
  checkedOut: boolean;
  notices: (readonly ['info' | 'error', string])[];
  errors: string[];
}

suite('Operations checking out', function () {
  this.timeout(30_000);

  let folder: string;
  let repository: TempRepository;
  let a: string;
  let b: string;
  let c: string;

  suiteSetup(async () => {
    folder = tempFolder('operations');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a');
    await repository.commit('b');
    await repository.commit('c');
    [a, b, c] = await repository.resolve('main~2', 'main~1', 'main');
    await repository.git('remote', 'add', 'origin', repository.root);
  });

  suiteTeardown(() => {
    removeFolder(folder);
  });

  const checkOut = async (target: CheckoutTarget): Promise<CheckedOut> => {
    const recording = recordingLog();
    const notices: CheckedOut['notices'] = [];
    const checkedOut = await checkout(
      recording.log,
      (level, message) => notices.push([level, message]),
      { gitPath: repository.gitPath, root: repository.root },
      target,
    );
    return {
      checkedOut,
      notices,
      errors: recording.error.map((entry) =>
        entry instanceof Error ? entry.message : String(entry),
      ),
    };
  };

  const checkedOutQuietly = async (target: CheckoutTarget): Promise<void> => {
    assert.deepStrictEqual(await checkOut(target), {
      checkedOut: true,
      notices: [],
      errors: [],
    });
  };

  const head = async (): Promise<string> =>
    (await repository.git('rev-parse', '--abbrev-ref', 'HEAD')).trim();

  test('checks out a tag, not a branch of the same name', async () => {
    await repository.git('tag', 'same', a);
    await repository.git('branch', 'same', 'main');
    try {
      await checkedOutQuietly({ kind: 'tag', name: 'same' });
      assert.strictEqual(await head(), 'HEAD');
      assert.deepStrictEqual(await repository.resolve('HEAD'), [a]);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('tag', '-d', 'same');
      await repository.git('branch', '-D', 'same');
    }
  });

  test('checks out a remote branch as a new branch that tracks it', async () => {
    await repository.git('update-ref', 'refs/remotes/origin/topic', 'main~1');
    try {
      await checkedOutQuietly({ kind: 'remote', name: 'origin/topic' });
      assert.strictEqual(await head(), 'topic');
      assert.strictEqual(
        (
          await repository.git('rev-parse', '--abbrev-ref', 'topic@{upstream}')
        ).trim(),
        'origin/topic',
      );
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'topic');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/topic');
    }
  });

  test('checks out a remote branch of a remote with a slash in its name as a branch of the same name', async () => {
    await repository.git('remote', 'add', 'team/fork', repository.root);
    await repository.git(
      'update-ref',
      'refs/remotes/team/fork/forked',
      'main~1',
    );
    try {
      await checkedOutQuietly({ kind: 'remote', name: 'team/fork/forked' });
      assert.strictEqual(await head(), 'forked');
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'forked').catch(() => '');
      await repository.git('remote', 'remove', 'team/fork');
    }
  });

  test('checks out a remote branch as a new branch, even with a tag of its name', async () => {
    await repository.git('update-ref', 'refs/remotes/origin/clash', 'main~1');
    await repository.git('tag', 'origin/clash', a);
    try {
      await checkedOutQuietly({ kind: 'remote', name: 'origin/clash' });
      assert.strictEqual(await head(), 'clash');
      assert.deepStrictEqual(await repository.resolve('clash'), [b]);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'clash').catch(() => '');
      await repository.git('tag', '-d', 'origin/clash');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/clash');
    }
  });

  test('fast-forwards the local branch of a remote branch that is ahead', async () => {
    await repository.git('branch', 'behind', 'main~1');
    await repository.git('update-ref', 'refs/remotes/origin/behind', 'main');
    try {
      await checkedOutQuietly({ kind: 'remote', name: 'origin/behind' });
      assert.strictEqual(await head(), 'behind');
      assert.deepStrictEqual(await repository.resolve('behind'), [c]);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'behind');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/behind');
    }
  });

  test('fast-forwards no branch but the one it checked out when HEAD moves on meanwhile', async () => {
    await repository.git('branch', 'behind', 'main~1');
    await repository.git('branch', 'aside', 'main~1');
    await repository.git('update-ref', 'refs/remotes/origin/behind', 'main');
    const hooks = path.join(folder, 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(
      path.join(hooks, 'post-checkout'),
      '#!/bin/sh\ngit symbolic-ref HEAD refs/heads/aside\n',
      { mode: 0o755 },
    );
    await repository.git('config', 'core.hooksPath', hooks);
    try {
      await checkedOutQuietly({ kind: 'remote', name: 'origin/behind' });
      assert.strictEqual(
        (await repository.git('symbolic-ref', 'HEAD')).trim(),
        'refs/heads/aside',
      );
      assert.deepStrictEqual(await repository.resolve('aside', 'behind'), [
        b,
        b,
      ]);
    } finally {
      await repository.git('config', '--unset', 'core.hooksPath');
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'behind', 'aside');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/behind');
    }
  });

  test("checks out the local branch of a remote branch it can't fast-forward, and says so", async () => {
    await repository.git('checkout', '-b', 'blocked', 'main~1');
    const clash = path.join(repository.root, 'clash');
    try {
      await repository.commit('adds clash', { clash: 'theirs' });
      await repository.git('update-ref', 'refs/remotes/origin/blocked', 'HEAD');
      await repository.git('reset', '--hard', 'main~1');
      await repository.git('checkout', 'main');
      fs.writeFileSync(clash, 'mine');
      const { checkedOut, notices, errors } = await checkOut({
        kind: 'remote',
        name: 'origin/blocked',
      });
      assert.strictEqual(checkedOut, true);
      assert.strictEqual(await head(), 'blocked');
      assert.strictEqual(notices.length, 1);
      assert.strictEqual(notices[0][0], 'error');
      assert.match(
        notices[0][1],
        /couldn't fast-forward it to origin\/blocked/,
      );
      assert.deepStrictEqual(await repository.resolve('blocked'), [b]);
      assert.strictEqual(errors.length, 2);
      assert.strictEqual(
        errors[0],
        'Fast-forwarding blocked to origin/blocked failed',
      );
      assert.match(
        errors[1],
        /^git merge --ff-only refs\/remotes\/origin\/blocked failed: /,
      );
    } finally {
      fs.rmSync(clash, { force: true });
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'blocked');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/blocked');
    }
  });

  test('says nothing when the local branch of a remote branch is up to date', async () => {
    await repository.git('branch', 'even', 'main');
    await repository.git('update-ref', 'refs/remotes/origin/even', 'main');
    try {
      await checkedOutQuietly({ kind: 'remote', name: 'origin/even' });
      assert.strictEqual(await head(), 'even');
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'even');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/even');
    }
  });

  test('says when a remote branch has diverged from its local one', async () => {
    await repository.git('checkout', '-b', 'apart', 'main~1');
    try {
      await repository.commit('apart only');
      await repository.git('checkout', 'main');
      await repository.git('update-ref', 'refs/remotes/origin/apart', 'main');
      const { checkedOut, notices, errors } = await checkOut({
        kind: 'remote',
        name: 'origin/apart',
      });
      assert.strictEqual(checkedOut, true);
      assert.strictEqual(await head(), 'apart');
      assert.strictEqual(notices.length, 1);
      assert.strictEqual(notices[0][0], 'info');
      assert.match(
        notices[0][1],
        /apart, which has diverged from origin\/apart/,
      );
      assert.deepStrictEqual(errors, []);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'apart');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/apart');
    }
  });

  test('says which commits a checkout leaves behind on no branch or tag, and nothing when none', async () => {
    await repository.git('checkout', '--detach', a);
    await repository.commit('stray one');
    await repository.commit('stray two');
    const [two, one] = await repository.resolve('HEAD', 'HEAD~1');
    try {
      const left = await checkOut({ kind: 'branch', name: 'main' });
      assert.deepStrictEqual(left.notices, [
        [
          'info',
          `Left 2 commits behind on no branch or tag: ${two.slice(0, 7)} ${one.slice(0, 7)}`,
        ],
      ]);
      await checkedOutQuietly({ kind: 'commit', hash: b });
      await checkedOutQuietly({ kind: 'branch', name: 'main' });
    } finally {
      await repository.git('checkout', '-f', 'main');
    }
  });

  test('names only the newest few commits a checkout leaves behind', async () => {
    await repository.git('checkout', '--detach', a);
    for (const stray of ['1', '2', '3', '4', '5', '6']) {
      await repository.commit(stray);
    }
    const newest = await repository.resolve(
      'HEAD',
      'HEAD~1',
      'HEAD~2',
      'HEAD~3',
      'HEAD~4',
    );
    try {
      const { notices } = await checkOut({ kind: 'branch', name: 'main' });
      assert.deepStrictEqual(notices, [
        [
          'info',
          `Left 6 commits behind on no branch or tag: ${newest.map((hash) => hash.slice(0, 7)).join(' ')} and 1 more`,
        ],
      ]);
    } finally {
      await repository.git('checkout', '-f', 'main');
    }
  });

  test('refuses to check out anything while a rebase is paused', async () => {
    await repository.git('checkout', '-b', 'onto', a);
    await repository.commit('onto');
    await repository.git('checkout', '-b', 'paused', a);
    await repository.commit('paused');
    await assert.rejects(repository.git('rebase', '--exec', 'false', 'onto'));
    const [stopped] = await repository.resolve('HEAD');
    try {
      const { checkedOut, notices, errors } = await checkOut({
        kind: 'branch',
        name: 'main',
      });
      assert.strictEqual(checkedOut, false);
      assert.strictEqual(notices.length, 1);
      assert.strictEqual(notices[0][0], 'error');
      assert.match(notices[0][1], /^Couldn't check out main/);
      assert.deepStrictEqual(await repository.resolve('HEAD'), [stopped]);
      assert.strictEqual(errors.length, 2);
      assert.strictEqual(errors[0], 'Checking out branch main failed');
      assert.match(
        errors[1],
        /^git .*switch .*main failed: fatal: cannot switch branch while rebasing/,
      );
    } finally {
      await repository.git('rebase', '--abort').catch(() => undefined);
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'onto', 'paused');
    }
  });
});
