import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
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
  logged: string[];
}

suite('Operations checking out', () => {
  let folder: string;
  let repository: TempRepository;
  let a: string;
  let b: string;
  let c: string;

  beforeAll(async () => {
    folder = tempFolder('operations');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a');
    await repository.commit('b');
    await repository.commit('c');
    [a, b, c] = await repository.resolve('main~2', 'main~1', 'main');
    await repository.git('remote', 'add', 'origin', repository.root);
  });

  afterAll(() => {
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
      logged: recording.info,
    };
  };

  const checkedOutQuietly = async (target: CheckoutTarget): Promise<void> => {
    const { checkedOut, notices, errors } = await checkOut(target);
    assert.deepStrictEqual(
      { checkedOut, notices, errors },
      { checkedOut: true, notices: [], errors: [] },
    );
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

  test('makes no branch from a remote branch of the same name when asked for a branch', async () => {
    await repository.git('update-ref', 'refs/remotes/origin/guessed', 'main');
    try {
      const { checkedOut } = await checkOut({
        kind: 'branch',
        name: 'guessed',
      });
      assert.strictEqual(checkedOut, false);
      assert.strictEqual(
        await repository.git('branch', '--list', 'guessed'),
        '',
      );
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'guessed').catch(() => '');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/guessed');
    }
  });

  test('logs what it checked out by name, a remote branch as the local branch it switched to or made', async () => {
    await repository.git('tag', 'v1', a);
    await repository.git('branch', 'kept', 'main');
    await repository.git('update-ref', 'refs/remotes/origin/kept', 'main');
    await repository.git('update-ref', 'refs/remotes/origin/made', 'main');
    try {
      const logged = async (target: CheckoutTarget) =>
        (await checkOut(target)).logged;
      assert.deepStrictEqual(await logged({ kind: 'tag', name: 'v1' }), [
        'Checked out tag v1',
      ]);
      assert.deepStrictEqual(await logged({ kind: 'commit', hash: b }), [
        `Checked out commit ${b}`,
      ]);
      assert.deepStrictEqual(await logged({ kind: 'branch', name: 'main' }), [
        'Checked out branch main',
      ]);
      assert.deepStrictEqual(
        await logged({ kind: 'remote', name: 'origin/kept' }),
        ['Checked out branch kept'],
      );
      assert.deepStrictEqual(
        await logged({ kind: 'remote', name: 'origin/made' }),
        ['Checked out new branch made tracking origin/made'],
      );
      assert.deepStrictEqual(
        (await checkOut({ kind: 'remote', name: 'origin/gone' })).errors[0],
        'Checking out remote branch origin/gone failed',
      );
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('tag', '-d', 'v1');
      await repository.git('branch', '-D', 'kept');
      await repository.git('branch', '-D', 'made').catch(() => '');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/kept');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/made');
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
      assert.strictEqual(fs.readFileSync(clash, 'utf8'), 'mine');
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
        /^git merge --ff-only --no-overwrite-ignore refs\/remotes\/origin\/blocked failed: /,
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
      assert.strictEqual(
        notices[0][1],
        "Switched to apart, which has diverged from origin/apart, so it couldn't be fast-forwarded",
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

  test('names only the newest 5 commits a checkout leaves behind, counting the rest', async () => {
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

  test('says a checkout succeeded though listing the commits it left behind fails', async () => {
    await repository.git('checkout', '--detach', a);
    await repository.commit('stray');
    const junk = path.join(repository.root, '.git', 'refs', 'heads', 'junk');
    fs.writeFileSync(junk, 'garbage\n');
    try {
      const { checkedOut, notices, errors } = await checkOut({
        kind: 'branch',
        name: 'main',
      });
      assert.strictEqual(checkedOut, true);
      assert.strictEqual(await head(), 'main');
      assert.deepStrictEqual(notices, []);
      assert.strictEqual(errors.length, 2);
      assert.strictEqual(
        errors[0],
        'Listing the commits a checkout left behind failed',
      );
      assert.match(errors[1], /^git rev-list .* failed: .*bad object junk/);
    } finally {
      fs.rmSync(junk, { force: true });
      await repository.git('checkout', '-f', 'main');
    }
  });

  test("says a checkout of a remote branch succeeded but couldn't fast-forward when HEAD can't be read after it", async () => {
    await repository.git('branch', 'behind', 'main~1');
    await repository.git('update-ref', 'refs/remotes/origin/behind', 'main');
    const hooks = path.join(folder, 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(
      path.join(hooks, 'post-checkout'),
      "#!/bin/sh\nprintf 'ref: refs/heads/a..b\\n' > .git/HEAD\n",
      { mode: 0o755 },
    );
    await repository.git('config', 'core.hooksPath', hooks);
    try {
      const { checkedOut, notices, errors } = await checkOut({
        kind: 'remote',
        name: 'origin/behind',
      });
      assert.strictEqual(checkedOut, true);
      assert.strictEqual(notices.length, 1);
      assert.strictEqual(notices[0][0], 'error');
      assert.match(
        notices[0][1],
        /^Switched to behind, but couldn't fast-forward it to origin\/behind\. /,
      );
      assert.strictEqual(
        errors[0],
        'Fast-forwarding behind to origin/behind failed',
      );
    } finally {
      fs.writeFileSync(
        path.join(repository.root, '.git', 'HEAD'),
        'ref: refs/heads/main\n',
      );
      await repository.git('config', '--unset', 'core.hooksPath');
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'behind');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/behind');
    }
  });

  test("says a checkout of a remote branch succeeded but couldn't fast-forward when the commits it is behind can't be counted, rather than taking it to be up to date", async () => {
    await repository.git('branch', 'unread', 'main~1');
    await repository.git('update-ref', 'refs/remotes/origin/unread', 'main');
    const hooks = path.join(folder, 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(
      path.join(hooks, 'post-checkout'),
      `#!/bin/sh\nprintf '${'a'.repeat(40)}\\n' > .git/refs/remotes/origin/unread\n`,
      { mode: 0o755 },
    );
    await repository.git('config', 'core.hooksPath', hooks);
    try {
      const { checkedOut, notices, errors } = await checkOut({
        kind: 'remote',
        name: 'origin/unread',
      });
      assert.strictEqual(checkedOut, true);
      assert.strictEqual(notices.length, 1);
      assert.strictEqual(notices[0][0], 'error');
      assert.match(
        notices[0][1],
        /^Switched to unread, but couldn't fast-forward it to origin\/unread\. /,
      );
      assert.strictEqual(
        errors[0],
        'Fast-forwarding unread to origin/unread failed',
      );
    } finally {
      await repository.git('config', '--unset', 'core.hooksPath');
      fs.rmSync(
        path.join(
          repository.root,
          '.git',
          'refs',
          'remotes',
          'origin',
          'unread',
        ),
      );
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'unread');
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

  test('checks out nothing over uncommitted changes it would overwrite, keeping them', async () => {
    const edited = path.join(repository.root, 'edited');
    const added = path.join(repository.root, 'added');
    await repository.git('checkout', '-b', 'kept', 'main');
    try {
      await repository.commit('kept', { edited: 'base' });
      await repository.git('checkout', '-b', 'changed');
      await repository.commit('changed', { edited: 'theirs', added: 'theirs' });
      const [changed] = await repository.resolve('HEAD');
      await repository.git('tag', 'changed-tag');
      await repository.git(
        'update-ref',
        'refs/remotes/origin/changing',
        'HEAD',
      );
      await repository.git('checkout', 'kept');
      const targets: CheckoutTarget[] = [
        { kind: 'branch', name: 'changed' },
        { kind: 'tag', name: 'changed-tag' },
        { kind: 'commit', hash: changed },
        { kind: 'remote', name: 'origin/changing' },
      ];
      for (const file of [edited, added]) {
        fs.writeFileSync(file, 'mine');
        for (const target of targets) {
          const { checkedOut, notices } = await checkOut(target);
          assert.strictEqual(checkedOut, false);
          assert.strictEqual(notices.length, 1);
          assert.strictEqual(notices[0][0], 'error');
          assert.match(notices[0][1], /would be overwritten by checkout/);
          assert.strictEqual(await head(), 'kept');
          assert.strictEqual(fs.readFileSync(file, 'utf8'), 'mine');
        }
        await repository.git('checkout', '--', 'edited');
      }
    } finally {
      await repository.git('checkout', '-f', 'main');
      fs.rmSync(added, { force: true });
      await repository.git('branch', '-D', 'kept', 'changed');
      await repository.git('branch', '-D', 'changing').catch(() => '');
      await repository.git('tag', '-d', 'changed-tag');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/changing');
    }
  });

  test('checks out nothing over ignored files and folders it would overwrite, keeping them, as they hold what the user keeps out of the repository', async () => {
    const secret = path.join(repository.root, 'secret.env');
    const dataset = path.join(repository.root, 'dataset');
    const exclude = path.join(repository.root, '.git', 'info', 'exclude');
    const excluded = fs.readFileSync(exclude, 'utf8');
    await repository.git('checkout', '-b', 'tracking', 'main');
    try {
      await repository.commit('tracking', {
        'secret.env': 'committed',
        dataset: 'committed',
      });
      const [tracking] = await repository.resolve('HEAD');
      await repository.git('tag', 'tracking-tag');
      await repository.git('update-ref', 'refs/remotes/origin/tracked', 'HEAD');
      await repository.git('checkout', 'main');
      fs.appendFileSync(exclude, '\nsecret.env\ndataset/\n');
      fs.writeFileSync(secret, 'mine');
      fs.mkdirSync(dataset);
      fs.writeFileSync(path.join(dataset, 'kept.csv'), 'mine');
      const targets: CheckoutTarget[] = [
        { kind: 'branch', name: 'tracking' },
        { kind: 'tag', name: 'tracking-tag' },
        { kind: 'commit', hash: tracking },
        { kind: 'remote', name: 'origin/tracked' },
      ];
      for (const target of targets) {
        const { checkedOut, notices } = await checkOut(target);
        assert.strictEqual(checkedOut, false, JSON.stringify(target));
        assert.strictEqual(notices.length, 1);
        assert.strictEqual(notices[0][0], 'error');
        assert.match(notices[0][1], /would be overwritten by checkout/);
        assert.strictEqual(await head(), 'main');
        assert.strictEqual(fs.readFileSync(secret, 'utf8'), 'mine');
        assert.strictEqual(
          fs.readFileSync(path.join(dataset, 'kept.csv'), 'utf8'),
          'mine',
        );
      }
    } finally {
      fs.writeFileSync(exclude, excluded);
      await repository.git('checkout', '-f', 'main');
      fs.rmSync(secret, { force: true });
      fs.rmSync(dataset, { recursive: true, force: true });
      await repository.git('branch', '-D', 'tracking');
      await repository.git('branch', '-D', 'tracked').catch(() => '');
      await repository.git('tag', '-d', 'tracking-tag');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/tracked');
    }
  });

  test('carries uncommitted changes over to a checkout that leaves their files alone', async () => {
    const same = path.join(repository.root, 'same');
    const loose = path.join(repository.root, 'loose');
    await repository.git('checkout', '-b', 'kept', 'main');
    try {
      await repository.commit('kept', { edited: 'base', same: 'base' });
      await repository.git('checkout', '-b', 'changed');
      await repository.commit('changed', { edited: 'theirs' });
      await repository.git('checkout', 'kept');
      fs.writeFileSync(same, 'mine');
      fs.writeFileSync(loose, 'mine');
      await checkedOutQuietly({ kind: 'branch', name: 'changed' });
      assert.strictEqual(await head(), 'changed');
      assert.strictEqual(fs.readFileSync(same, 'utf8'), 'mine');
      assert.strictEqual(fs.readFileSync(loose, 'utf8'), 'mine');
      assert.strictEqual(
        await repository.git('status', '--porcelain'),
        ' M same\n?? loose\n',
      );
    } finally {
      await repository.git('checkout', '-f', 'main');
      fs.rmSync(loose, { force: true });
      await repository.git('branch', '-D', 'kept', 'changed');
    }
  });
});
