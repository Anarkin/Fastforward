import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import { strings } from '../../../../../lib/shared/strings';
import { soloKey } from '../../../../../tools/git/main/storage';
import type { GitTool } from '../../../../../tools/git/main/tool';
import type { FakeStore } from '../../../../helpers/fakeStore';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  type Connection,
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  type FakePage,
  gate,
  openView,
  stubMethod,
  takeErrorsLogged,
  gitState,
} from '../../../../helpers/harness';
import {
  restoreRepository,
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';

suite('Git tool refreshing one repository', () => {
  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];

  const { log, info, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, fixture } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  const restore = () => restoreRepository(repository, fixture.merge);

  suite('with its tab open', () => {
    let fastforward: GitTool;
    let page: FakePage;
    let connection: Connection;
    let store: FakeStore;

    beforeEach(async () => {
      ({
        view: fastforward,
        page,
        connection,
        store,
      } = await openView(log, [repository.root]));
    });

    afterEach(() => connection.dispose());

    test('applies the merge setting to the history shown, without reloading it', async () => {
      let listed = 0;
      stubMethod(fastforward, 'sendCommits', async (original, ...args) => {
        listed++;
        await original(...args);
      });
      await connection.receive({ type: 'setCollapseMerges', collapse: false });
      assert.strictEqual(page.last('commits')?.total, 5);
      assert.strictEqual(listed, 0);
      page.clear();
      await connection.refresh();
      assert.strictEqual(page.last('commits'), undefined, 'reloaded');
    });

    test('stops reading the history for Solo once it is toggled again, showing only the history asked for last, as the first was read whole and laid out first', async () => {
      const held = gate();
      const signals: AbortSignal[] = [];
      stubMethod(fastforward, 'listFullHistory', async (original, ...args) => {
        const signal = args.find((arg) => arg instanceof AbortSignal);
        assert.ok(signal instanceof AbortSignal);
        signals.push(signal);
        if (signals.length === 1) {
          await Promise.race([
            held.opened,
            new Promise((resolve) => signal.addEventListener('abort', resolve)),
          ]);
        }
        return original(...args);
      });
      page.clear();
      try {
        const on = connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await waitFor(() => signals.length === 1, 'the history to be read');
        const off = connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        held.open();
        await Promise.all([on, off]);
        assert.strictEqual(signals[0].aborted, true);
        assert.strictEqual(commitsSent(page.messages), 1);
      } finally {
        await gitState(store).update(soloKey, {});
      }
    });

    test('shows only the history of the checked-out commit when solo, and every branch again after', async () => {
      const [tree] = await repository.resolve('HEAD^{tree}');
      const side = (
        await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
      ).trim();
      await repository.git('branch', 'side', side);
      try {
        await connection.refresh();
        assert.strictEqual(page.last('commits')?.total, 4);
        page.clear();
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        const applying = page.messages.flatMap((message) =>
          message.type === 'applyingSolo' ? [message.running] : [],
        );
        assert.deepStrictEqual(applying, [true, false]);
        assert.ok(
          page.messages.findIndex((message) => message.type === 'commits') <
            page.messages.findLastIndex(
              (message) => message.type === 'applyingSolo',
            ),
        );
        assert.deepStrictEqual(gitState(store).get(soloKey), {
          [repository.root]: true,
        });
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
        assert.strictEqual(page.last('commits')?.total, 4);
      } finally {
        await gitState(store).update(soloKey, {});
        await repository.git('branch', '-D', 'side');
      }
    });

    test('lists the history again only for refs that change its commits other than by adding some, whatever solo leaves out', async () => {
      let listed = 0;
      stubMethod(fastforward, 'sendCommits', async (original, ...args) => {
        listed++;
        await original(...args);
      });
      const refreshed = async (...changes: (readonly string[])[]) => {
        page.clear();
        for (const change of changes) {
          await repository.git(...change);
        }
        await connection.refresh();
        return page.last('commits');
      };
      const [tree] = await repository.resolve('HEAD^{tree}');
      const side = (
        await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
      ).trim();
      try {
        const tagged = await refreshed(['tag', 'kept', fixture.a]);
        assert.ok(
          page.last('repository')?.refs.some((ref) => ref.name === 'kept'),
        );
        assert.ok(tagged?.decorations.includes(2));
        const detached = await refreshed(['checkout', '--detach', fixture.f2]);
        assert.strictEqual(detached?.total, 5);
        assert.deepStrictEqual(
          detached.commits.map((commit) => commit.subject),
          ['merge feature', 'b', 'f2', 'f1', 'a'],
        );
        assert.strictEqual(
          (await refreshed(['checkout', 'main'], ['tag', '-d', 'kept']))?.total,
          3,
        );
        assert.strictEqual(listed, 0);
        assert.strictEqual(
          (await refreshed(['branch', 'side', side]))?.total,
          4,
        );
        assert.ok(
          page.last('repository')?.refs.some((ref) => ref.name === 'side'),
        );
        assert.strictEqual(listed, 0);
        assert.strictEqual(
          (await refreshed(['branch', '-D', 'side']))?.total,
          3,
        );
        assert.strictEqual(listed, 1);
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        listed = 0;
        assert.strictEqual(
          (await refreshed(['update-ref', 'refs/remotes/origin/side', side]))
            ?.total,
          3,
        );
        assert.strictEqual(listed, 0);
      } finally {
        await gitState(store).update(soloKey, {});
        await repository.git('update-ref', '-d', 'refs/heads/side');
        await repository.git('update-ref', '-d', 'refs/remotes/origin/side');
        await restore();
      }
    });

    test('reads the history whole once a commit read as a stash, without the commits of its index and untracked files, is a stash no more but stays, kept by a branch or built on', async () => {
      await connection.receive({ type: 'setCollapseMerges', collapse: false });
      const before = page.last('commits')?.total ?? 0;
      const untracked = path.join(repository.root, 'untracked.txt');
      const branches = ['kept-stash', 'built-on-stash'];
      try {
        for (const [index, branch] of branches.entries()) {
          fs.writeFileSync(untracked, `${branch}\n`);
          await repository.git('stash', 'push', '-q', '-u');
          await connection.refresh();
          const [stash] = await repository.resolve('stash@{0}');
          await repository.git('branch', branch, stash);
          await repository.git('stash', 'drop', '-q');
          if (index > 0) {
            const built = (
              await repository.git(
                'commit-tree',
                `${stash}^{tree}`,
                '-p',
                stash,
                '-m',
                'on the stash',
              )
            ).trim();
            await repository.git('branch', '-f', branch, built);
          }
          page.clear();
          await connection.refresh();
          assert.strictEqual(
            page.last('commits')?.total,
            before + 3 * (index + 1) + index,
            branch,
          );
        }
      } finally {
        for (const branch of branches) {
          await repository.git('branch', '-D', branch).catch(() => '');
        }
        fs.rmSync(untracked, { force: true });
        await restore();
      }
    });

    test('sends the history again on the next refresh after it failed to load', async () => {
      const before = page.last('commits')?.generation ?? -1;
      let failed = false;
      const elsewhere = tempFolder('not-a-repository');
      stubMethod(fastforward, 'sendShownHistory', (original, ...args) => {
        const [context, ...rest] = args;
        if (failed || typeof context !== 'object') {
          return original(...args);
        }
        failed = true;
        return original({ ...context, root: elsewhere }, ...rest);
      });
      await repository.git('branch', 'failed-once', 'main~1');
      try {
        await connection.refresh();
        assert.ok(failed);
        await connection.refresh();
        assert.ok((page.last('commits')?.generation ?? -1) > before);
        takeErrorsLogged(
          logged,
          /^Refreshing the tab failed$/,
          /^git log .* failed: fatal: not a git repository/,
        );
      } finally {
        await repository.git('branch', '-D', 'failed-once');
        removeFolder(elsewhere);
      }
    });

    test('sends the history again for rows asked of the layout it failed to replace', async () => {
      const generation = page.last('commits')?.generation;
      assert.ok(generation !== undefined);
      let failed = false;
      const elsewhere = tempFolder('not-a-repository');
      stubMethod(fastforward, 'sendShownHistory', (original, ...args) => {
        const [context, ...rest] = args;
        if (failed || typeof context !== 'object') {
          return original(...args);
        }
        failed = true;
        return original({ ...context, root: elsewhere }, ...rest);
      });
      try {
        await connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
        assert.ok(failed);
        page.clear();
        await connection.receive({
          type: 'loadCommits',
          root: repository.root,
          generation,
          start: 0,
          count: 100,
        });
        const shown = page.last('commits');
        assert.ok(shown && shown.generation > generation);
        assert.strictEqual(shown.total, 5);
        takeErrorsLogged(
          logged,
          /^Handling toggleMerge from the page failed$/,
          /^git log .* failed: fatal: not a git repository/,
        );
      } finally {
        removeFolder(elsewhere);
      }
    });

    test('keeps the top commit in place when a ref moves', async () => {
      await connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
        report: 1,
      });

      page.clear();
      await connection.refresh();
      assert.strictEqual(page.last('commits'), undefined, 'reloaded unchanged');

      try {
        await repository.commit('c');
        await connection.refresh();
        const commits = page.last('commits');
        assert.strictEqual(commits?.total, 4);
        assert.deepStrictEqual(commits.scrollTarget, {
          index: 2,
          offset: 7,
          report: 1,
        });
        assert.ok(page.last('repository'));
      } finally {
        await restore();
      }
    });

    test('adds the commits refs bring to the history without listing it whole, and lists it once a commit is gone', async () => {
      let listed = 0;
      stubMethod(fastforward, 'sendCommits', async (original, ...args) => {
        listed++;
        await original(...args);
      });
      try {
        page.clear();
        await repository.commit('c');
        await connection.refresh();
        const added = page.last('commits');
        assert.strictEqual(added?.total, 4);
        assert.strictEqual(added.commits[0]?.subject, 'c');
        assert.strictEqual(listed, 0);
        assert.ok(info.includes(strings.log.refsExtended(1)));
        page.clear();
        await repository.git('reset', '-q', '--hard', 'HEAD~1');
        await connection.refresh();
        const gone = page.last('commits');
        assert.strictEqual(gone?.total, 3);
        assert.notStrictEqual(gone.commits[0]?.subject, 'c');
        assert.strictEqual(listed, 1);
      } finally {
        await restore();
      }
    });

    test('stays at the top of the list when new commits come in', async () => {
      await connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: workingTreeHash,
        offset: 0,
        report: 1,
      });
      page.clear();
      try {
        await repository.commit('on top');
        await connection.refresh();
        const commits = page.last('commits');
        assert.strictEqual(commits?.commits[0]?.subject, 'on top');
        assert.deepStrictEqual(commits.scrollTarget, {
          index: -1,
          offset: 0,
          report: 1,
        });
      } finally {
        await restore();
      }
    });

    test('lets go of the selected commit once it is gone from the history', async () => {
      await repository.commit('doomed', { 'doomed.txt': 'doomed\n' });
      const [doomed] = await repository.resolve('HEAD');
      try {
        await connection.refresh();
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: doomed,
          selection: 7,
        });
        assert.strictEqual(page.last('files')?.hash, doomed);
        page.clear();
        await repository.git('reset', '--hard', 'HEAD~1');
        await connection.refresh();
        assert.strictEqual(page.last('unselect')?.selection, 7);
        page.clear();
        await connection.receive({ type: 'ready' });
        assert.strictEqual(page.last('files'), undefined);
        assert.strictEqual(page.last('commits')?.selectedIndex, undefined);
      } finally {
        await restore();
      }
    });
  });
});
