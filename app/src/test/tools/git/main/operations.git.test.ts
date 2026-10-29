import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  checkout,
  pushToUpstream,
  type Pushed,
} from '../../../../tools/git/main/operations';
import type { CheckoutTarget } from '../../../../tools/git/shared/protocol';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../repositories';
import { recordingLog } from '../../../stub';

type Notices = (readonly ['info' | 'error', string])[];

interface CheckedOut {
  checkedOut: boolean;
  notices: Notices;
  errors: string[];
  logged: string[];
}

let folder: string;
let base: TempRepository;
let a: string;
let b: string;
let c: string;
let copies = 0;

beforeAll(async () => {
  folder = tempFolder('operations');
  base = await tempRepository(path.join(folder, 'app'));
  await base.commit('a');
  await base.commit('b');
  await base.commit('c');
  [a, b, c] = await base.resolve('main~2', 'main~1', 'main');
  await base.git('remote', 'add', 'origin', '.');
});

afterAll(() => {
  removeFolder(folder);
});

function copied(): Promise<TempRepository> {
  copies += 1;
  return base.copy(path.join(folder, String(copies)));
}

function postCheckout(repository: TempRepository, script: string): void {
  const hooks = path.join(repository.root, '.git', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, 'post-checkout'), `#!/bin/sh\n${script}`, {
    mode: 0o755,
  });
}

async function head(repository: TempRepository): Promise<string> {
  return (await repository.git('rev-parse', '--abbrev-ref', 'HEAD')).trim();
}

async function checkOut(
  repository: TempRepository,
  target: CheckoutTarget,
): Promise<CheckedOut> {
  const recording = recordingLog();
  const notices: Notices = [];
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
}

async function checkedOutQuietly(
  repository: TempRepository,
  target: CheckoutTarget,
): Promise<void> {
  const { checkedOut, notices, errors } = await checkOut(repository, target);
  assert.deepStrictEqual(
    { checkedOut, notices, errors },
    { checkedOut: true, notices: [], errors: [] },
  );
}

async function pushed(
  repository: TempRepository,
): Promise<{ pushed: Pushed; notices: Notices }> {
  const notices: Notices = [];
  const result = await pushToUpstream(
    recordingLog().log,
    (level, message) => notices.push([level, message]),
    { gitPath: repository.gitPath, root: repository.root },
    new AbortController().signal,
  );
  return { pushed: result, notices };
}

async function pushesNothing(
  repository: TempRepository,
  message: string,
): Promise<void> {
  assert.deepStrictEqual(await pushed(repository), {
    pushed: 'unchanged',
    notices: [['info', message]],
  });
}

suite.concurrent('Operations checking out', () => {
  test('checks out a tag, not a branch of the same name', async () => {
    const repository = await copied();
    await repository.git('tag', 'same', a);
    await repository.git('branch', 'same', 'main');
    await checkedOutQuietly(repository, { kind: 'tag', name: 'same' });
    assert.strictEqual(await head(repository), 'HEAD');
    assert.deepStrictEqual(await repository.resolve('HEAD'), [a]);
  });

  test('makes no branch from a remote branch of the same name when asked for a branch', async () => {
    const repository = await copied();
    await repository.git('update-ref', 'refs/remotes/origin/guessed', 'main');
    const { checkedOut } = await checkOut(repository, {
      kind: 'branch',
      name: 'guessed',
    });
    assert.strictEqual(checkedOut, false);
    assert.strictEqual(await repository.git('branch', '--list', 'guessed'), '');
  });

  test('logs what it checked out by name, a remote branch as the local branch it switched to or made', async () => {
    const repository = await copied();
    await repository.git('tag', 'v1', a);
    await repository.git('branch', 'kept', 'main');
    await repository.git('update-ref', 'refs/remotes/origin/kept', 'main');
    await repository.git('update-ref', 'refs/remotes/origin/made', 'main');
    const logged = async (target: CheckoutTarget) =>
      (await checkOut(repository, target)).logged;
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
      (await checkOut(repository, { kind: 'remote', name: 'origin/gone' }))
        .errors[0],
      'Checking out remote branch origin/gone failed',
    );
  });

  test('checks out a remote branch as a new branch that tracks it', async () => {
    const repository = await copied();
    await repository.git('update-ref', 'refs/remotes/origin/topic', 'main~1');
    await checkedOutQuietly(repository, {
      kind: 'remote',
      name: 'origin/topic',
    });
    assert.strictEqual(await head(repository), 'topic');
    assert.strictEqual(
      (
        await repository.git('rev-parse', '--abbrev-ref', 'topic@{upstream}')
      ).trim(),
      'origin/topic',
    );
  });

  test('checks out a remote branch of a remote with a slash in its name as a branch of the same name', async () => {
    const repository = await copied();
    await repository.git('remote', 'add', 'team/fork', '.');
    await repository.git(
      'update-ref',
      'refs/remotes/team/fork/forked',
      'main~1',
    );
    await checkedOutQuietly(repository, {
      kind: 'remote',
      name: 'team/fork/forked',
    });
    assert.strictEqual(await head(repository), 'forked');
  });

  test('checks out a remote branch as a new branch, even with a tag of its name', async () => {
    const repository = await copied();
    await repository.git('update-ref', 'refs/remotes/origin/clash', 'main~1');
    await repository.git('tag', 'origin/clash', a);
    await checkedOutQuietly(repository, {
      kind: 'remote',
      name: 'origin/clash',
    });
    assert.strictEqual(await head(repository), 'clash');
    assert.deepStrictEqual(await repository.resolve('clash'), [b]);
  });

  test('fast-forwards the local branch of a remote branch that is ahead', async () => {
    const repository = await copied();
    await repository.git('branch', 'behind', 'main~1');
    await repository.git('update-ref', 'refs/remotes/origin/behind', 'main');
    await checkedOutQuietly(repository, {
      kind: 'remote',
      name: 'origin/behind',
    });
    assert.strictEqual(await head(repository), 'behind');
    assert.deepStrictEqual(await repository.resolve('behind'), [c]);
  });

  test('fast-forwards no branch but the one it checked out when HEAD moves on meanwhile', async () => {
    const repository = await copied();
    await repository.git('branch', 'behind', 'main~1');
    await repository.git('branch', 'aside', 'main~1');
    await repository.git('update-ref', 'refs/remotes/origin/behind', 'main');
    postCheckout(repository, 'git symbolic-ref HEAD refs/heads/aside\n');
    await checkedOutQuietly(repository, {
      kind: 'remote',
      name: 'origin/behind',
    });
    assert.strictEqual(
      (await repository.git('symbolic-ref', 'HEAD')).trim(),
      'refs/heads/aside',
    );
    assert.deepStrictEqual(await repository.resolve('aside', 'behind'), [b, b]);
  });

  test("checks out the local branch of a remote branch it can't fast-forward, and says so", async () => {
    const repository = await copied();
    await repository.git('branch', 'blocked', 'main~1');
    await repository.importCommits('refs/remotes/origin/blocked', 'main~1', [
      { message: 'adds clash', files: { clash: 'theirs' } },
    ]);
    const clash = path.join(repository.root, 'clash');
    fs.writeFileSync(clash, 'mine');
    const { checkedOut, notices, errors } = await checkOut(repository, {
      kind: 'remote',
      name: 'origin/blocked',
    });
    assert.strictEqual(checkedOut, true);
    assert.strictEqual(await head(repository), 'blocked');
    assert.strictEqual(fs.readFileSync(clash, 'utf8'), 'mine');
    assert.strictEqual(notices.length, 1);
    assert.strictEqual(notices[0][0], 'error');
    assert.match(notices[0][1], /couldn't fast-forward it to origin\/blocked/);
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
  });

  test('says nothing when the local branch of a remote branch is up to date', async () => {
    const repository = await copied();
    await repository.git('branch', 'even', 'main');
    await repository.git('update-ref', 'refs/remotes/origin/even', 'main');
    await checkedOutQuietly(repository, {
      kind: 'remote',
      name: 'origin/even',
    });
    assert.strictEqual(await head(repository), 'even');
  });

  test('says when a remote branch has diverged from its local one', async () => {
    const repository = await copied();
    await repository.importCommits('refs/heads/apart', 'main~1', [
      { message: 'apart only' },
    ]);
    await repository.git('update-ref', 'refs/remotes/origin/apart', 'main');
    const { checkedOut, notices, errors } = await checkOut(repository, {
      kind: 'remote',
      name: 'origin/apart',
    });
    assert.strictEqual(checkedOut, true);
    assert.strictEqual(await head(repository), 'apart');
    assert.strictEqual(notices.length, 1);
    assert.strictEqual(notices[0][0], 'info');
    assert.strictEqual(
      notices[0][1],
      "Switched to apart, which has diverged from origin/apart, so it couldn't be fast-forwarded",
    );
    assert.deepStrictEqual(errors, []);
  });

  test('says which commits a checkout leaves behind on no branch or tag, and nothing when none', async () => {
    const repository = await copied();
    await repository.git('checkout', '--detach', a);
    await repository.commit('stray one');
    await repository.commit('stray two');
    const [two, one] = await repository.resolve('HEAD', 'HEAD~1');
    const left = await checkOut(repository, { kind: 'branch', name: 'main' });
    assert.deepStrictEqual(left.notices, [
      [
        'info',
        `Left 2 commits behind on no branch or tag: ${two.slice(0, 7)} ${one.slice(0, 7)}`,
      ],
    ]);
    await checkedOutQuietly(repository, { kind: 'commit', hash: b });
    await checkedOutQuietly(repository, { kind: 'branch', name: 'main' });
  });

  test('names only the newest 5 commits a checkout leaves behind, counting the rest', async () => {
    const repository = await copied();
    const strays = await repository.importCommits(
      'refs/heads/strays',
      a,
      ['1', '2', '3', '4', '5', '6'].map((message) => ({ message })),
    );
    await repository.git('checkout', '--detach', 'strays');
    await repository.git('branch', '-D', 'strays');
    const newest = strays.toReversed().slice(0, 5);
    const { notices } = await checkOut(repository, {
      kind: 'branch',
      name: 'main',
    });
    assert.deepStrictEqual(notices, [
      [
        'info',
        `Left 6 commits behind on no branch or tag: ${newest.map((hash) => hash.slice(0, 7)).join(' ')} and 1 more`,
      ],
    ]);
  });

  test('says a checkout succeeded though listing the commits it left behind fails', async () => {
    const repository = await copied();
    await repository.git('checkout', '--detach', a);
    await repository.commit('stray');
    fs.writeFileSync(
      path.join(repository.root, '.git', 'refs', 'heads', 'junk'),
      'garbage\n',
    );
    const { checkedOut, notices, errors } = await checkOut(repository, {
      kind: 'branch',
      name: 'main',
    });
    assert.strictEqual(checkedOut, true);
    assert.strictEqual(await head(repository), 'main');
    assert.deepStrictEqual(notices, []);
    assert.strictEqual(errors.length, 2);
    assert.strictEqual(
      errors[0],
      'Listing the commits a checkout left behind failed',
    );
    assert.match(errors[1], /^git rev-list .* failed: .*bad object junk/);
  });

  test("says a checkout of a remote branch succeeded but couldn't fast-forward when HEAD can't be read after it", async () => {
    const repository = await copied();
    await repository.git('branch', 'behind', 'main~1');
    await repository.git('update-ref', 'refs/remotes/origin/behind', 'main');
    postCheckout(repository, "printf 'ref: refs/heads/a..b\\n' > .git/HEAD\n");
    const { checkedOut, notices, errors } = await checkOut(repository, {
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
  });

  test("says a checkout of a remote branch succeeded but couldn't fast-forward when the commits it is behind can't be counted, rather than taking it to be up to date", async () => {
    const repository = await copied();
    await repository.git('branch', 'unread', 'main~1');
    await repository.git('update-ref', 'refs/remotes/origin/unread', 'main');
    postCheckout(
      repository,
      `printf '${'a'.repeat(40)}\\n' > .git/refs/remotes/origin/unread\n`,
    );
    const { checkedOut, notices, errors } = await checkOut(repository, {
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
  });

  test('refuses to check out anything while a rebase is paused', async () => {
    const repository = await copied();
    await repository.importCommits('refs/heads/onto', a, [{ message: 'onto' }]);
    await repository.importCommits('refs/heads/paused', a, [
      { message: 'paused' },
    ]);
    await repository.git('checkout', 'paused');
    await assert.rejects(repository.git('rebase', '--exec', 'false', 'onto'));
    const [stopped] = await repository.resolve('HEAD');
    const { checkedOut, notices, errors } = await checkOut(repository, {
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
  });

  test('checks out nothing over uncommitted changes it would overwrite, keeping them', async () => {
    const repository = await copied();
    const edited = path.join(repository.root, 'edited');
    const added = path.join(repository.root, 'added');
    await repository.git('checkout', '-b', 'kept', 'main');
    await repository.commit('kept', { edited: 'base' });
    const [changed] = await repository.importCommits(
      'refs/heads/changed',
      'kept',
      [{ message: 'changed', files: { edited: 'theirs', added: 'theirs' } }],
    );
    await repository.git('tag', 'changed-tag', changed);
    await repository.git('update-ref', 'refs/remotes/origin/changing', changed);
    const targets: CheckoutTarget[] = [
      { kind: 'branch', name: 'changed' },
      { kind: 'tag', name: 'changed-tag' },
      { kind: 'commit', hash: changed },
      { kind: 'remote', name: 'origin/changing' },
    ];
    for (const file of [edited, added]) {
      fs.writeFileSync(file, 'mine');
      for (const target of targets) {
        const { checkedOut, notices } = await checkOut(repository, target);
        assert.strictEqual(checkedOut, false);
        assert.strictEqual(notices.length, 1);
        assert.strictEqual(notices[0][0], 'error');
        assert.match(notices[0][1], /would be overwritten by checkout/);
        assert.strictEqual(await head(repository), 'kept');
        assert.strictEqual(fs.readFileSync(file, 'utf8'), 'mine');
      }
      await repository.git('checkout', '--', 'edited');
    }
  });

  test('checks out nothing over ignored files and folders it would overwrite, keeping them, as they hold what the user keeps out of the repository', async () => {
    const repository = await copied();
    const secret = path.join(repository.root, 'secret.env');
    const dataset = path.join(repository.root, 'dataset');
    const [tracking] = await repository.importCommits(
      'refs/heads/tracking',
      'main',
      [
        {
          message: 'tracking',
          files: { 'secret.env': 'committed', dataset: 'committed' },
        },
      ],
    );
    await repository.git('tag', 'tracking-tag', tracking);
    await repository.git('update-ref', 'refs/remotes/origin/tracked', tracking);
    fs.appendFileSync(
      path.join(repository.root, '.git', 'info', 'exclude'),
      '\nsecret.env\ndataset/\n',
    );
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
      const { checkedOut, notices } = await checkOut(repository, target);
      assert.strictEqual(checkedOut, false, JSON.stringify(target));
      assert.strictEqual(notices.length, 1);
      assert.strictEqual(notices[0][0], 'error');
      assert.match(notices[0][1], /would be overwritten by checkout/);
      assert.strictEqual(await head(repository), 'main');
      assert.strictEqual(fs.readFileSync(secret, 'utf8'), 'mine');
      assert.strictEqual(
        fs.readFileSync(path.join(dataset, 'kept.csv'), 'utf8'),
        'mine',
      );
    }
  });

  test('carries uncommitted changes over to a checkout that leaves their files alone', async () => {
    const repository = await copied();
    const same = path.join(repository.root, 'same');
    const loose = path.join(repository.root, 'loose');
    await repository.git('checkout', '-b', 'kept', 'main');
    await repository.commit('kept', { edited: 'base', same: 'base' });
    await repository.importCommits('refs/heads/changed', 'kept', [
      { message: 'changed', files: { edited: 'theirs' } },
    ]);
    fs.writeFileSync(same, 'mine');
    fs.writeFileSync(loose, 'mine');
    await checkedOutQuietly(repository, { kind: 'branch', name: 'changed' });
    assert.strictEqual(await head(repository), 'changed');
    assert.strictEqual(fs.readFileSync(same, 'utf8'), 'mine');
    assert.strictEqual(fs.readFileSync(loose, 'utf8'), 'mine');
    assert.strictEqual(
      await repository.git('status', '--porcelain'),
      ' M same\n?? loose\n',
    );
  });
});

suite.concurrent('Operations pushing', () => {
  test('pushes nothing from a detached HEAD, saying it has no upstream', async () => {
    const repository = await copied();
    await repository.git('checkout', '--detach', 'main');
    await pushesNothing(
      repository,
      'The checked-out commit is on no branch, so it has no upstream',
    );
  });

  test('publishes nothing when there is no remote, or more than one to choose from, saying so', async () => {
    const repository = await copied();
    await repository.git('checkout', '-b', 'topic');
    await repository.git('remote', 'add', 'second', '.');
    await pushesNothing(
      repository,
      "topic has no upstream, and with several remotes, it's unclear which to push it to",
    );
    await repository.git('remote', 'remove', 'second');
    await repository.git('remote', 'remove', 'origin');
    await pushesNothing(
      repository,
      "topic has no upstream, and there's no remote to push it to",
    );
  });

  test('pushes nothing to an upstream deleted on the remote, rather than make it again', async () => {
    const repository = await copied();
    await repository.git('update-ref', 'refs/remotes/origin/brief', 'main');
    await repository.git('checkout', '-b', 'brief', '--track', 'origin/brief');
    await repository.git('update-ref', '-d', 'refs/remotes/origin/brief');
    await repository.commit('more');
    await pushesNothing(
      repository,
      "origin/brief, the upstream of brief, doesn't exist anymore",
    );
  });

  test("pushes nothing from a branch whose upstream has another name, as git push wouldn't either, saying so", async () => {
    const repository = await copied();
    await repository.git('update-ref', 'refs/remotes/origin/main', 'main');
    await repository.git('checkout', '-b', 'feature', '--track', 'origin/main');
    await repository.commit('feature');
    await pushesNothing(
      repository,
      "feature tracks origin/main, which has another name, so it wasn't pushed, as git push wouldn't push it either",
    );
  });

  test("pushes nothing from a branch whose upstream is a pull request's ref, as git push wouldn't either", async () => {
    const repository = await copied();
    await repository.git('checkout', '-b', 'review');
    await repository.git('config', 'branch.review.remote', 'origin');
    await repository.git('config', 'branch.review.merge', 'refs/pull/1/head');
    await repository.commit('review');
    await pushesNothing(
      repository,
      "review tracks origin/refs/pull/1/head, which has another name, so it wasn't pushed, as git push wouldn't push it either",
    );
  });

  test('pushes nothing to an upstream that is a local branch, saying it has no remote', async () => {
    const repository = await copied();
    await repository.git('checkout', '-b', 'follower', '--track', 'main');
    await repository.commit('more');
    await pushesNothing(
      repository,
      'follower tracks the local branch main, so it has no remote to push to',
    );
  });
});
