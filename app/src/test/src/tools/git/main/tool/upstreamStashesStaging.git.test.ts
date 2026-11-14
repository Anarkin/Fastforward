import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, suite, test } from 'vitest';
import { workingTreeHash } from '../../../../../../tools/git/shared/protocol';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../../helpers/repositories';
import { recordingLog } from '../../../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  withNotices,
  withView,
} from '../../../../../helpers/harness';

suite('Git tool upstream', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let upstream: string;

  beforeAll(async () => {
    folder = tempFolder('upstream');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a');
    await repository.commit('b');
    const [tree] = await repository.resolve('HEAD^{tree}');
    upstream = (
      await repository.git('commit-tree', tree, '-p', 'HEAD~1', '-m', 'pushed')
    ).trim();
    await repository.git('remote', 'add', 'origin', 'https://example.com/x');
    await repository.git('update-ref', 'refs/remotes/origin/main', upstream);
    await repository.git('branch', '--set-upstream-to=origin/main');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('reveals the upstream of the checked-out branch when asked', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.connection.receive({
        type: 'showUpstream',
        root: repository.root,
      });
      assert.strictEqual(view.page.last('reveal')?.hash, upstream);
    });
  });

  test('says why there is no upstream to show', async () => {
    await withView(log, [repository.root], async (view) => {
      await withNotices(view.page, 'info', async (messages) => {
        const ask = () =>
          view.connection.receive({
            type: 'showUpstream',
            root: repository.root,
          });
        await repository.git('branch', '--unset-upstream');
        try {
          await ask();
        } finally {
          await repository.git('branch', '--set-upstream-to=origin/main');
        }
        await repository.git('update-ref', '-d', 'refs/remotes/origin/main');
        try {
          await ask();
        } finally {
          await repository.git(
            'update-ref',
            'refs/remotes/origin/main',
            upstream,
          );
        }
        await repository.git('switch', '-q', '--detach');
        try {
          await ask();
        } finally {
          await repository.git('switch', '-q', 'main');
        }
        await view.connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await ask();
        assert.deepStrictEqual(messages, [
          '"main" has no upstream',
          '"origin/main", the upstream of "main", doesn\'t exist anymore',
          'The checked-out commit is on no branch, so it has no upstream',
          '"origin/main" is not in the history while Solo shows only that of the checked-out commit',
        ]);
        assert.strictEqual(view.page.last('reveal'), undefined);
      });
    });
  });
});

suite('Git tool stashes', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let stash: string;

  beforeAll(async () => {
    folder = tempFolder('stash');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a', { 'tracked.txt': 'one\n' });
    await repository.commit('b');
    fs.writeFileSync(path.join(repository.root, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(repository.root, 'new.txt'), 'new\n');
    await repository.git('stash', 'push', '-q', '-u', '-m', 'kept aside');
    [stash] = await repository.resolve('stash@{0}');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows a stash on its base, and its untracked files with its changes', async () => {
    await withView(log, [repository.root], async (view) => {
      const commits = view.page.last('commits');
      assert.deepStrictEqual(
        commits?.commits.map((commit) => commit.subject),
        ['On main: kept aside', 'b', 'a'],
      );
      assert.deepStrictEqual(
        commits.graph.map((row) => row.stash ?? false),
        [true, false, false],
      );
      assert.deepStrictEqual(view.page.last('repository')?.stashes, [
        { name: 'stash@{0}', commit: stash, message: 'On main: kept aside' },
      ]);
      await view.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: stash,
      });
      assert.deepStrictEqual(
        view.page.last('files')?.files.map((file) => [file.path, file.status]),
        [
          ['tracked.txt', 'M'],
          ['new.txt', 'U'],
        ],
      );
      assert.match(view.page.last('diff')?.patch ?? '', /^\+new$/m);
    });
  });

  test('leaves the stashes out of the history while solo', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: true,
      });
      assert.strictEqual(view.page.last('commits')?.total, 2);
    });
  });

  test('lists the history again once a stash is dropped', async () => {
    await withView(log, [repository.root], async (view) => {
      await repository.git('stash', 'drop', '-q');
      try {
        await view.connection.refresh();
        assert.strictEqual(view.page.last('commits')?.total, 2);
        assert.deepStrictEqual(view.page.last('repository')?.stashes, []);
      } finally {
        await repository.git('stash', 'store', '-q', '-m', 'kept aside', stash);
      }
    });
  });
});

suite('Git tool staged and unstaged changes', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;

  beforeAll(async () => {
    folder = tempFolder('staging');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a', { 'both.txt': 'one\n' });
  });

  beforeEach(async () => {
    fs.writeFileSync(path.join(repository.root, 'both.txt'), 'two\n');
    await repository.git('add', 'both.txt');
    fs.writeFileSync(path.join(repository.root, 'both.txt'), 'three\n');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows all the changes since HEAD first, and the staged and unstaged ones apart, each side read from where it is kept', async () => {
    await withView(log, [repository.root], async (view) => {
      const root = repository.root;
      assert.strictEqual(view.page.last('workingTree')?.files, 1);
      await view.connection.receive({
        type: 'selectCommit',
        root,
        hash: workingTreeHash,
      });
      const files = view.page.last('files');
      assert.deepStrictEqual(
        [
          files?.all?.map((file) => file.path),
          files?.staged?.map((file) => file.path),
          files?.files.map((file) => file.path),
        ],
        [['both.txt'], ['both.txt'], ['both.txt']],
      );
      const all = view.page.last('diff');
      assert.ok(all);
      assert.strictEqual(all.area, undefined);
      assert.match(all.patch, /^-one$/m);
      assert.match(all.patch, /^\+three$/m);
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: undefined,
        area: 'staged',
      });
      const staged = view.page.last('diff');
      assert.strictEqual(staged?.area, 'staged');
      assert.match(staged.patch, /^\+two$/m);
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: 'both.txt',
        area: 'staged',
      });
      const blob = /^index [0-9a-f]+\.\.([0-9a-f]+)/m.exec(
        view.page.last('diff')?.patch ?? '',
      )?.[1];
      assert.ok(blob);
      await view.connection.receive({
        type: 'loadTexts',
        root,
        hash: workingTreeHash,
        diff: 0,
        texts: [{ path: 'both.txt', side: 'new', blob }],
      });
      assert.strictEqual(view.page.last('texts')?.texts[0]?.text, 'two\n');
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: 'both.txt',
        area: 'unstaged',
      });
      const unstaged = view.page.last('diff');
      assert.deepStrictEqual(
        [unstaged?.path, unstaged?.area],
        ['both.txt', 'unstaged'],
      );
      assert.match(unstaged?.patch ?? '', /^-two$/m);
      assert.match(unstaged?.patch ?? '', /^\+three$/m);
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: undefined,
      });
      const again = view.page.last('diff');
      assert.ok(again);
      assert.strictEqual(again.area, undefined);
      assert.doesNotMatch(again.patch, /two/);
      assert.match(again.patch, /^\+three$/m);
    });
  });

  test('starts with all the changes while nothing is staged too', async () => {
    await repository.git('restore', '--staged', 'both.txt');
    await withView(log, [repository.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      assert.deepStrictEqual(view.page.last('files')?.staged, []);
      const diff = view.page.last('diff');
      assert.ok(diff);
      assert.strictEqual(diff.area, undefined);
      assert.match(diff.patch, /^\+three$/m);
    });
  });
});
