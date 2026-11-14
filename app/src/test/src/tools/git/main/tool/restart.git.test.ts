import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { GitStorage } from '../../../../../../tools/git/main/storage';
import { workingTreeHash } from '../../../../../../tools/git/shared/protocol';
import { FakeStore } from '../../../../../support/fakeStore';
import {
  attach,
  closeViews,
  failOnErrorsLogged,
  gitState,
  newView,
  openView,
  saveTabs,
  rootOf,
  settingsForViews,
  stubMethod,
  tabOf,
  takeErrorsLogged,
} from '../../../../../support/harness';
import {
  installedGit,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../../support/repositories';
import { recordingLog } from '../../../../../support/stub';

const storageOf = (store: FakeStore) =>
  new GitStorage(settingsForViews(), gitState(store));

suite('Git tool started again', () => {
  let folder: string;
  let repository: TempRepository;
  let first: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('restart');
    repository = await tempRepository(path.join(folder, 'r'));
    await repository.commit('first', { 'a.txt': 'a\n', 'b.txt': 'b\n' });
    await repository.commit('second', { 'a.txt': 'a2\n', 'b.txt': 'b2\n' });
    [first] = await repository.resolve('HEAD~1');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  async function startedAgain(store: FakeStore) {
    const view = newView(log, await installedGit(), settingsForViews(), store);
    stubMethod(view, 'watch', () => Promise.resolve());
    const opened = attach(view);
    await opened.connection.receive({ type: 'ready' });
    await view.idle();
    return opened;
  }

  async function ranBefore(
    select: (own: Awaited<ReturnType<typeof openView>>) => Promise<void>,
  ) {
    const own = await openView(log, [repository.root]);
    await select(own);
    own.connection.dispose();
    await own.view.idle();
    return own.store;
  }

  test('selects again the commit and the file last selected in the worktree, scrolled to', async () => {
    const store = await ranBefore(async ({ connection }) => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: first,
      });
      await connection.receive({
        type: 'selectFile',
        root: repository.root,
        hash: first,
        path: 'b.txt',
      });
    });

    const { page } = await startedAgain(store);

    const commits = page.last('commits');
    assert.strictEqual(commits?.selectedIndex, 1);
    assert.deepStrictEqual(commits.scrollTarget, { index: 1 });
    assert.strictEqual(page.last('files')?.hash, first);
    const diff = page.last('diff');
    assert.strictEqual(diff?.hash, first);
    assert.strictEqual(diff.path, 'b.txt');
    assert.match(diff.patch, /^\+b$/m);
    assert.doesNotMatch(diff.patch, /^\+a$/m);
  });

  test('selects again the uncommitted changes, with the file and the changes of it last selected', async () => {
    fs.writeFileSync(path.join(repository.root, 'a.txt'), 'staged\n');
    await repository.git('add', 'a.txt');
    fs.writeFileSync(path.join(repository.root, 'a.txt'), 'unstaged\n');
    try {
      const store = await ranBefore(async ({ connection }) => {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'selectFile',
          root: repository.root,
          hash: workingTreeHash,
          path: 'a.txt',
          area: 'staged',
        });
      });

      const { page } = await startedAgain(store);

      assert.strictEqual(page.last('files')?.hash, workingTreeHash);
      const diff = page.last('diff');
      assert.strictEqual(diff?.path, 'a.txt');
      assert.strictEqual(diff.area, 'staged');
      assert.match(diff.patch, /^\+staged$/m);
      assert.doesNotMatch(diff.patch, /unstaged/);
    } finally {
      await repository.git('reset', '--hard');
    }
  });

  test('selects nothing, saying nothing of it, when the commit last selected is no longer in the history, and forgets it', async () => {
    const store = new FakeStore();
    await saveTabs(store, [repository.root]);
    await storageOf(store).setSelection(repository.root, {
      hash: 'f'.repeat(40),
      path: 'a.txt',
    });

    const { page } = await startedAgain(store);

    assert.ok(page.last('commits'));
    assert.strictEqual(page.last('files'), undefined);
    assert.strictEqual(page.last('diff'), undefined);
    assert.strictEqual(page.last('error'), undefined);
    assert.strictEqual(
      storageOf(store).selectionOf(repository.root),
      undefined,
    );
  });

  test('selects again the commit and the file last selected in a tab whose preload failed', async () => {
    const other = await tempRepository(path.join(folder, 'preloaded'));
    await other.commit('other', { 'o.txt': 'o\n' });
    const store = new FakeStore();
    await saveTabs(store, [other.root, repository.root], other.root);
    await storageOf(store).setSelection(repository.root, {
      hash: first,
      path: 'b.txt',
    });
    const view = newView(log, await installedGit(), settingsForViews(), store);
    stubMethod(view, 'watch', () => Promise.resolve());
    let failed = false;
    stubMethod(view, 'sendWorkingTree', async (original, ...args) => {
      if (!failed && rootOf(args[0]) === repository.root) {
        failed = true;
        throw new Error('working tree failed');
      }
      await original(...args);
    });
    const { page, connection } = attach(view);
    await connection.receive({ type: 'ready' });
    await view.idle();
    await connection.receive({
      type: 'preloadTab',
      tab: tabOf(page, repository.root),
    });
    assert.ok(failed);
    takeErrorsLogged(
      logged,
      /^Preloading tab .* failed$/,
      /^working tree failed$/,
    );
    await connection.receive({
      type: 'selectTab',
      tab: tabOf(page, repository.root),
    });
    assert.strictEqual(page.last('commits')?.selectedIndex, 1);
    assert.strictEqual(page.last('files')?.hash, first);
    assert.strictEqual(page.last('diff')?.path, 'b.txt');
  });
});
