import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extendedHistory, listHistory } from '../../git/history';
import { readRefs } from '../../git/repository';
import { headsOf } from '../../history/merges';
import { tipsInGitOrder } from '../../tabState';
import {
  commitAtTime,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';
import { entriesOf } from './historyFixtures';

async function repositoryWithBranches(name: string): Promise<TempRepository> {
  const repository = await tempRepository(tempFolder(name));
  await repository.commit('c0', { 'a.txt': 'zero\n' });
  await repository.git('checkout', '-q', '-b', 'side');
  await repository.commit('s1', { 's.txt': 'side\n' });
  await repository.git('checkout', '-q', 'main');
  await repository.commit('c1', { 'a.txt': 'one\n' });
  await repository.git('tag', 'v1');
  await repository.git('update-ref', 'refs/remotes/origin/main', 'main');
  await repository.git('update-ref', 'refs/remotes/origin/side', 'side');
  return repository;
}

async function across(
  repository: TempRepository,
  change: () => Promise<unknown>,
  solo = false,
  options?: { signal?: AbortSignal; maxRegion?: number },
) {
  const { gitPath, root } = repository;
  const before = await readRefs(gitPath, root);
  const older = await listHistory(
    gitPath,
    root,
    solo,
    before.stashes.map((stash) => stash.commit),
  );
  await change();
  const after = await readRefs(gitPath, root);
  const stashes = after.stashes.map((stash) => stash.commit);
  const extended = await extendedHistory(
    gitPath,
    root,
    older,
    headsOf(older),
    tipsInGitOrder(after.head, after.refs, solo, after.stashes, after.dates),
    solo ? [] : stashes,
    after.dates,
    options,
  );
  const reloaded = await listHistory(gitPath, root, solo, stashes);
  return {
    extended: extended && entriesOf(extended),
    reloaded: entriesOf(reloaded),
    added: reloaded.length - older.length,
    gone: entriesOf(older).filter(({ hash }) => !reloaded.has(hash)).length,
  };
}

async function onlyOnMain(repository: TempRepository): Promise<void> {
  await repository.git('tag', '-d', 'v1');
  await repository.git('update-ref', '-d', 'refs/remotes/origin/main');
}

async function mergedOlderBranch(repo: TempRepository) {
  const [base, tree] = await repo.resolve('main', 'main^{tree}');
  let topic = base;
  for (const message of ['t1', 't2']) {
    topic = (
      await repo.git('commit-tree', tree, '-p', topic, '-m', message)
    ).trim();
  }
  await repo.commit('c2', { 'a.txt': 'two\n' });
  return async () => {
    const main = (await repo.resolve('main'))[0];
    const merge = (
      await repo.git('commit-tree', tree, '-p', main, '-p', topic, '-m', 'm')
    ).trim();
    await repo.git('update-ref', 'refs/heads/main', merge);
  };
}

suite('Extending the history read from git', function () {
  this.timeout(120_000);
  const made: string[] = [];

  async function repository(name: string): Promise<TempRepository> {
    const made1 = await repositoryWithBranches(name);
    made.push(made1.root);
    return made1;
  }

  suiteTeardown(() => {
    for (const root of made) {
      removeFolder(root);
    }
  });

  test('adds a commit on the branch checked out as reading the history whole would', async () => {
    const repo = await repository('extend-commit');
    const { extended, reloaded, added } = await across(repo, () =>
      repo.commit('c2', { 'a.txt': 'two\n' }),
    );
    assert.strictEqual(added, 1);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('adds commits made in the same second as the tip they are built on, as a rebase makes them, as reading it whole would', async () => {
    const repo = await repository('extend-same-second');
    const { extended, reloaded, added } = await across(repo, async () => {
      const [main, tree] = await repo.resolve('main', 'main^{tree}');
      const time = (await repo.git('log', '-1', '--format=%ct', main)).trim();
      const person = `Test <test@example.com> ${time} +0000`;
      let parent = main;
      for (const message of ['r1', 'r2']) {
        const file = path.join(
          repo.root,
          '..',
          `${path.basename(repo.root)}-${message}`,
        );
        fs.writeFileSync(
          file,
          `tree ${tree}\nparent ${parent}\nauthor ${person}\ncommitter ${person}\n\n${message}\n`,
        );
        parent = (
          await repo.git('hash-object', '-t', 'commit', '-w', file)
        ).trim();
        fs.rmSync(file);
      }
      await repo.git('update-ref', 'refs/heads/main', parent);
    });
    assert.strictEqual(added, 2);
    assert.ok(extended);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('adds commits fetched onto remote branches, with a merge of them, as reading it whole would', async () => {
    const repo = await repository('extend-fetch');
    const { extended, reloaded, added } = await across(repo, async () => {
      const [main, side, tree] = await repo.resolve(
        'main',
        'side',
        'main^{tree}',
      );
      const ahead = (
        await repo.git('commit-tree', tree, '-p', main, '-m', 'ahead')
      ).trim();
      const sideways = (
        await repo.git('commit-tree', tree, '-p', side, '-m', 'sideways')
      ).trim();
      const merge = (
        await repo.git(
          'commit-tree',
          tree,
          '-p',
          ahead,
          '-p',
          sideways,
          '-m',
          'merge',
        )
      ).trim();
      await repo.git('update-ref', 'refs/remotes/origin/main', merge);
      await repo.git('update-ref', 'refs/remotes/origin/side', sideways);
    });
    assert.strictEqual(added, 3);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('adds commits to a history git keeps a commit-graph of, which git orders by another walk, as reading it whole would', async () => {
    const repo = await repository('extend-commit-graph');
    await repo.git('commit-graph', 'write', '--reachable');
    const { extended, reloaded, added } = await across(repo, async () => {
      await repo.commit('c2', { 'a.txt': 'two\n' });
      await repo.git('checkout', '-q', 'side');
      await repo.commit('s2', { 's.txt': 'two\n' });
    });
    assert.strictEqual(added, 2);
    assert.ok(extended);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('adds a merge of a branch whose commits are older than the tip merged into, among the old commits, as reading it whole would', async () => {
    const repo = await repository('extend-older-branch');
    const [base, tree] = await repo.resolve('main', 'main^{tree}');
    let topic = base;
    for (const message of ['t1', 't2']) {
      topic = (
        await repo.git('commit-tree', tree, '-p', topic, '-m', message)
      ).trim();
    }
    await repo.commit('c2', { 'a.txt': 'two\n' });
    const { extended, reloaded, added } = await across(repo, async () => {
      const main = (await repo.resolve('main'))[0];
      const merge = (
        await repo.git('commit-tree', tree, '-p', main, '-p', topic, '-m', 'm')
      ).trim();
      await repo.git('update-ref', 'refs/heads/main', merge);
    });
    assert.strictEqual(added, 3);
    assert.ok(extended);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('leaves the history to be read whole rather than read again more of its newest commits than it may to place commits among the old ones, as that region can be most of the history', async () => {
    const repo = await repository('extend-region-cap');
    const merge = await mergedOlderBranch(repo);
    const { extended } = await across(repo, merge, false, { maxRegion: 2 });
    assert.strictEqual(extended, undefined);
  });

  test('stops reading the history again to place new commits once called off, as when its tab closes', async () => {
    const repo = await repository('extend-region-stopped');
    const merge = await mergedOlderBranch(repo);
    const stopping = new AbortController();
    stopping.abort();
    await assert.rejects(
      across(repo, merge, false, { signal: stopping.signal }),
      { name: 'AbortError' },
    );
  });

  test('adds a remote branch moved onto a commit older than the tip checked out, among the old commits, as reading it whole would', async () => {
    const repo = await repository('extend-older-remote');
    const [side, tree] = await repo.resolve('side', 'side^{tree}');
    const behind = (
      await repo.git('commit-tree', tree, '-p', side, '-m', 'behind')
    ).trim();
    await repo.commit('c2', { 'a.txt': 'two\n' });
    const { extended, reloaded, added } = await across(repo, () =>
      repo.git('update-ref', 'refs/remotes/origin/side', behind),
    );
    assert.strictEqual(added, 1);
    assert.ok(extended);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('adds random commits of random times onto random refs either as reading the history whole would or not at all', async () => {
    let seed = 7;
    const random = (count: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % count;
    };
    let extendedCount = 0;
    for (let round = 0; round < 12; round++) {
      const repo = await repository(`extend-random-${round}`);
      if (random(2) === 0) {
        await repo.git('commit-graph', 'write', '--reachable');
      }
      const [tree, start] = await repo.resolve('main^{tree}', 'main');
      const time = Number(
        (await repo.git('log', '-1', '--format=%ct', start)).trim(),
      );
      const known = (await repo.git('rev-list', '--all')).trim().split('\n');
      const created: string[] = [];
      const commitAt = async (parents: readonly string[], at: number) => {
        const person = `Test <test@example.com> ${at} +0000`;
        const file = path.join(
          repo.root,
          '..',
          `${path.basename(repo.root)}-${created.length}`,
        );
        fs.writeFileSync(
          file,
          [
            `tree ${tree}`,
            ...parents.map((parent) => `parent ${parent}`),
            `author ${person}`,
            `committer ${person}`,
            '',
            `r${round} ${created.length}`,
            '',
          ].join('\n'),
        );
        const hash = (
          await repo.git('hash-object', '-t', 'commit', '-w', file)
        ).trim();
        fs.rmSync(file);
        created.push(hash);
        return hash;
      };
      const pick = () => {
        const all = [...known, ...created];
        return all[random(all.length)];
      };
      const { extended, reloaded } = await across(repo, async () => {
        for (let commit = 0; commit < 2 + random(5); commit++) {
          const parents =
            random(4) === 0
              ? [pick(), pick()]
              : random(9) === 0
                ? []
                : [pick()];
          await commitAt(
            [...new Set(parents)],
            time - 300 + random(6) * 60 * (random(3) === 0 ? -1 : 1),
          );
        }
        const refs = [
          'refs/heads/main',
          'refs/heads/side',
          'refs/remotes/origin/main',
          'refs/remotes/origin/side',
          'refs/tags/v1',
          `refs/tags/r${round}`,
        ];
        for (const ref of refs) {
          const move = random(4);
          if (move === 0) {
            await repo.git('update-ref', ref, created[random(created.length)]);
          } else if (move === 1 && !ref.endsWith('/main')) {
            await repo.git('update-ref', '-d', ref);
          }
        }
      });
      if (extended) {
        extendedCount++;
        assert.deepStrictEqual(extended, reloaded, `round ${round}`);
      }
    }
    assert.ok(extendedCount >= 3, `${extendedCount} rounds extended`);
  });

  test('leaves the history to be read whole once HEAD leaves one of two tips of the same second for a commit on another branch, as git then takes the other first', async () => {
    const repo = await repository('extend-tied-tips');
    const [main] = await repo.resolve('main');
    const time = Number(
      (await repo.git('log', '-1', '--format=%ct', main)).trim(),
    );
    const a = await commitAtTime(repo, main, time + 1, 'a');
    const c = await commitAtTime(repo, main, time + 1, 'c');
    await repo.git('update-ref', 'refs/heads/main', a);
    await repo.git('branch', 'aaa', c);
    const { extended, reloaded, added } = await across(repo, async () => {
      await repo.git('checkout', '-q', 'side');
      await repo.commit('s2', { 's.txt': 'two\n' });
    });
    assert.strictEqual(added, 1);
    assert.deepStrictEqual(
      reloaded.slice(1, 3).map(({ hash }) => hash),
      [c, a],
    );
    assert.strictEqual(extended, undefined);
  });

  test("adds a commit beside two remote branches of the same second, which git takes in the order their remote's HEAD puts them in, as reading it whole would", async () => {
    const repo = await repository('extend-remote-head');
    const [main] = await repo.resolve('main');
    const time = Number(
      (await repo.git('log', '-1', '--format=%ct', main)).trim(),
    );
    for (const [branch, message] of [
      ['zmain', 'a'],
      ['aaa', 'c'],
    ]) {
      await repo.git(
        'update-ref',
        `refs/remotes/origin/${branch}`,
        await commitAtTime(repo, main, time + 1, message),
      );
    }
    await repo.git(
      'symbolic-ref',
      'refs/remotes/origin/HEAD',
      'refs/remotes/origin/zmain',
    );
    const { extended, reloaded, added } = await across(repo, () =>
      repo.commit('c2', { 'a.txt': 'two\n' }),
    );
    assert.strictEqual(added, 1);
    assert.ok(extended);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('leaves the history to be read whole once a fetch builds on one of two remote branches of the same second, as git takes the other first', async () => {
    const repo = await repository('extend-tied-fetch');
    const [main] = await repo.resolve('main');
    const time = Number(
      (await repo.git('log', '-1', '--format=%ct', main)).trim(),
    );
    const p = await commitAtTime(repo, main, time + 1, 'p');
    const a = await commitAtTime(repo, main, time + 1, 'a');
    await repo.git('update-ref', 'refs/remotes/origin/aa', p);
    await repo.git('update-ref', 'refs/remotes/origin/bb', a);
    const { extended, reloaded, added } = await across(repo, async () => {
      const [tree] = await repo.resolve('main^{tree}');
      const n = (
        await repo.git('commit-tree', tree, '-p', p, '-m', 'n')
      ).trim();
      await repo.git('update-ref', 'refs/remotes/origin/aa', n);
    });
    assert.strictEqual(added, 1);
    assert.deepStrictEqual(
      reloaded.slice(1, 3).map(({ hash }) => hash),
      [a, p],
    );
    assert.strictEqual(extended, undefined);
  });

  test('adds a branch started from an older commit and tagged at its tip, as reading it whole would', async () => {
    const repo = await repository('extend-branch');
    const { extended, reloaded, added } = await across(repo, async () => {
      await repo.git('checkout', '-q', '-b', 'older', 'main~1');
      await repo.commit('o1', { 'o.txt': 'older\n' });
      await repo.git('tag', 'v2');
    });
    assert.strictEqual(added, 1);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('adds a branch with no history in common, as reading it whole would', async () => {
    const repo = await repository('extend-orphan');
    const { extended, reloaded, added } = await across(repo, async () => {
      await repo.git('checkout', '-q', '--orphan', 'orphan');
      await repo.commit('root', { 'r.txt': 'root\n' });
    });
    assert.strictEqual(added, 1);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('adds a stash with untracked files on its base alone, as reading it whole would', async () => {
    const repo = await repository('extend-stash');
    const { extended, reloaded, added } = await across(repo, async () => {
      fs.writeFileSync(path.join(repo.root, 'a.txt'), 'changed\n');
      fs.writeFileSync(path.join(repo.root, 'new.txt'), 'untracked\n');
      await repo.git('stash', 'push', '-u');
    });
    assert.strictEqual(added, 1);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('adds a commit while solo, as reading the history of HEAD alone would', async () => {
    const repo = await repository('extend-solo');
    const { extended, reloaded, added } = await across(
      repo,
      () => repo.commit('c2', { 'a.txt': 'two\n' }),
      true,
    );
    assert.strictEqual(added, 1);
    assert.deepStrictEqual(extended, reloaded);
  });

  test('leaves the history to be read whole once a commit in it is gone: amended, reset away, its branch deleted or its stash dropped', async () => {
    const cases: Record<
      string,
      {
        alone: (repo: TempRepository) => Promise<unknown>;
        change: (repo: TempRepository) => Promise<unknown>;
      }
    > = {
      amended: {
        alone: onlyOnMain,
        change: (repo) => repo.git('commit', '--amend', '-q', '-m', 'c1!'),
      },
      reset: {
        alone: onlyOnMain,
        change: (repo) => repo.git('reset', '-q', '--hard', 'main~1'),
      },
      deleted: {
        alone: (repo) =>
          repo.git('update-ref', '-d', 'refs/remotes/origin/side'),
        change: (repo) => repo.git('branch', '-q', '-D', 'side'),
      },
      dropped: {
        alone: async (repo) => {
          fs.writeFileSync(path.join(repo.root, 'a.txt'), 'changed\n');
          await repo.git('stash', 'push', '-q');
        },
        change: (repo) => repo.git('stash', 'drop', '-q'),
      },
    };
    for (const [name, { alone, change }] of Object.entries(cases)) {
      const repo = await repository(`extend-${name}`);
      await alone(repo);
      const { extended, gone } = await across(repo, () => change(repo));
      assert.ok(gone > 0, `${name} leaves a commit out`);
      assert.strictEqual(extended, undefined, name);
    }
  });

  test('leaves the history to be read whole, rather than failing, once a tip it had is pruned from the repository along with its branch', async () => {
    const repo = await repository('extend-pruned');
    await repo.git('update-ref', '-d', 'refs/remotes/origin/side');
    const { extended, gone } = await across(repo, async () => {
      await repo.git('branch', '-q', '-D', 'side');
      await repo.git('reflog', 'expire', '--expire=now', '--all');
      await repo.git('gc', '-q', '--prune=now');
      await repo.commit('c2', { 'a.txt': 'two\n' });
    });
    assert.strictEqual(gone, 1);
    assert.strictEqual(extended, undefined);
  });
});
