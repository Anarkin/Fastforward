import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { UserSettings } from '../../../../shell/main/settings';
import {
  bookmarksKey,
  GitStorage,
  lastFetchesKey,
  recentKey,
  remoteTagsKey,
  soloKey,
  worktreesKey,
} from '../../../../tools/git/main/storage';
import { FakeStore } from '../../../fakeStore';
import { defaultSettings } from '../../../fixtures';

function storageOf(state = new FakeStore()): GitStorage {
  return new GitStorage(new UserSettings(defaultSettings()), state);
}

suite('Git storage', () => {
  test("reads the bookmarks saved in the state, a remote's tag among them", async () => {
    const store = new FakeStore();
    const bookmarks = [
      { kind: 'branch', name: 'main' },
      { kind: 'remote-tag', name: 'origin/v1' },
    ];
    await store.update('bookmarks', { '/r': bookmarks });
    const storage = storageOf(store);
    assert.deepStrictEqual(storage.bookmarksOf('/r'), bookmarks);
  });

  test('lays out a new view as the default settings say', () => {
    const defaults = defaultSettings();
    assert.deepStrictEqual(storageOf().layout, {
      type: 'layout',
      columnWidths: defaults.tools.git.columnWidths,
      defaultColumnWidths: defaults.tools.git.columnWidths,
      collapseMerges: defaults.tools.git.collapseMerges,
      entireFilePinned: defaults.tools.git.entireFilePinned,
      ignoreWhitespace: defaults.tools.git.ignoreWhitespace,
      wordWrap: defaults.tools.git.wordWrap,
      showWhitespace: defaults.tools.git.showWhitespace,
      diffLayout: defaults.tools.git.diffLayout,
      showAllFiles: defaults.tools.git.showAllFiles,
      autoFetch: defaults.tools.git.autoFetch,
      autoFetchMinutes: defaults.tools.git.autoFetchMinutes,
      hideDimmedButtons: true,
    });
    assert.strictEqual(defaults.autoSortTabs, false);
  });

  test('fetches at most every 35791 minutes, as seldom as a timer can wait, and tells the page so, as it says how often it fetches and when a fetch is late by it', () => {
    const storage = new GitStorage(
      new UserSettings({
        ...defaultSettings(),
        tools: {
          ...defaultSettings().tools,
          git: {
            ...defaultSettings().tools.git,
            autoFetch: true,
            autoFetchMinutes: 50_000,
          },
        },
      }),
      new FakeStore(),
    );
    assert.strictEqual(storage.autoFetchMinutes, 35_791);
    assert.strictEqual(
      storage.layout.autoFetchMinutes,
      storage.autoFetchMinutes,
    );
  });

  test('keeps solo per repository in the state, only where it differs from the default', async () => {
    const state = new FakeStore();
    const storage = storageOf(state);
    const root = path.resolve('r');
    await storage.setSolo(root, true);
    assert.deepStrictEqual(state.get('solo'), { [root]: true });
    await storage.setSolo(root, false);
    assert.deepStrictEqual(state.get('solo'), {});
  });

  test('keeps when each repository last fetched and last failed to, for the next start', async () => {
    const state = new FakeStore();
    const storage = storageOf(state);
    const root = path.resolve('r');
    assert.deepStrictEqual(storage.lastFetchOf(root), {});
    await storage.recordFetch(root, true, 1);
    await storage.recordFetch(root, false, 2);
    await storage.recordFetch(`${root}${path.sep}`, true, 3);
    assert.deepStrictEqual(storageOf(state).lastFetchOf(root), {
      succeeded: 2,
      failed: 3,
    });
    assert.deepStrictEqual(storage.lastFetchOf(path.resolve('other')), {});
  });

  test('keeps the tags each remote of a repository had when last listed, for the next start, dropping remotes no longer there', async () => {
    const state = new FakeStore();
    const storage = storageOf(state);
    const root = path.resolve('r');
    const [a, b] = ['a', 'b'].map((digit) => digit.repeat(40));
    assert.deepStrictEqual(storage.remoteTagsOf(root), new Map());
    await storage.setRemoteTags(root, 'origin', new Map([['v1', a]]));
    await storage.setRemoteTags(root, 'upstream', new Map([['v2', b]]));
    await storage.keepRemoteTags(root, ['origin']);
    assert.deepStrictEqual(
      storageOf(state).remoteTagsOf(root),
      new Map([['origin', new Map([['v1', a]])]]),
    );
    assert.deepStrictEqual(
      storage.remoteTagsOf(path.resolve('other')),
      new Map(),
    );
  });

  test('reads remote tags of the wrong shape, as a hand edit can leave them, leaving out what is not a tag and its commit', async () => {
    const state = new FakeStore();
    const root = path.resolve('r');
    const c = 'c'.repeat(40);
    await state.update(remoteTagsKey, {
      [root]: { origin: { v1: 5, v2: c, v3: 'not a hash' }, junk: 'x' },
    });
    assert.deepStrictEqual(
      storageOf(state).remoteTagsOf(root),
      new Map([['origin', new Map([['v2', c]])]]),
    );
  });

  test('reads state of the wrong shape, as a hand edit can leave it, as never saved', async () => {
    const store = new FakeStore();
    const root = path.resolve('r');
    await store.update(recentKey, 'x');
    await store.update(bookmarksKey, { [root]: 'x' });
    await store.update(soloKey, { [root]: 'yes' });
    await store.update(lastFetchesKey, {
      [root]: { succeeded: 'x', failed: 5 },
    });
    const storage = storageOf(store);
    assert.deepStrictEqual(storage.lastFetchOf(root), { failed: 5 });
    assert.deepStrictEqual(storage.recent, []);
    assert.strictEqual(storage.bookmarksOf(root), undefined);
    assert.strictEqual(storage.soloOf(root), defaultSettings().tools.git.solo);
    await storage.addRecent(root);
    assert.deepStrictEqual(storage.recent, [root]);
  });

  test('leaves out the entries of the wrong shape from saved lists', async () => {
    const store = new FakeStore();
    const root = path.resolve('r');
    const main = { kind: 'branch', name: 'main' };
    await store.update(recentKey, [null, root]);
    await store.update(bookmarksKey, {
      [root]: [main, { kind: 'x', name: 'y' }, { kind: 'tag' }, 5],
    });
    const storage = storageOf(store);
    assert.deepStrictEqual(storage.recent, [root]);
    assert.deepStrictEqual(storage.bookmarksOf(root), [main]);
  });

  test('keeps one set of bookmarks for a folder spelled two ways', async () => {
    const store = new FakeStore();
    const storage = storageOf(store);
    const root = path.resolve('r');
    const main = [{ kind: 'branch', name: 'main' }] as const;
    await storage.setBookmarks(root, main);
    assert.deepStrictEqual(storage.bookmarksOf(root + path.sep), main);
    const dev = [{ kind: 'branch', name: 'dev' }] as const;
    await storage.setBookmarks(root + path.sep, dev);
    assert.deepStrictEqual(Object.keys(store.values.get('bookmarks') ?? {}), [
      root,
    ]);
    assert.deepStrictEqual(storage.bookmarksOf(root), dev);
  });

  test('turns solo on and off for one repository, whatever the spelling of its folder', async () => {
    const storage = storageOf();
    const [r1, r2] = [path.resolve('r1'), path.resolve('r2')];
    assert.strictEqual(storage.soloOf(r1), false);
    await storage.setSolo(r1, true);
    assert.strictEqual(storage.soloOf(r1 + path.sep), true);
    assert.strictEqual(storage.soloOf(r2), false);
    await storage.setSolo(r1 + path.sep, true);
    await storage.setSolo(r2, true);
    await storage.setSolo(r1, false);
    assert.strictEqual(storage.soloOf(r1), false);
    assert.strictEqual(storage.soloOf(r2), true);
  });

  test('remembers the worktree shown of each repository, the main one unless another was', async () => {
    const store = new FakeStore();
    const storage = storageOf(store);
    const [repository, linked] = [path.resolve('r'), path.resolve('r-linked')];
    assert.strictEqual(storage.worktreeOf(repository), repository);
    await storage.setWorktree(repository + path.sep, linked);
    assert.strictEqual(storage.worktreeOf(repository), linked);
    await storage.setWorktree(repository, repository + path.sep);
    assert.deepStrictEqual(store.values.get(worktreesKey), {});
    assert.strictEqual(storage.worktreeOf(repository), repository);
  });

  test('keeps the 50 newest recent repositories, newest first, as many as the + menu can be set to list', async () => {
    const storage = storageOf();
    for (let i = 0; i <= 50; i++) {
      await storage.addRecent(path.resolve(`r${i}`));
    }
    assert.deepStrictEqual(
      storage.recent,
      Array.from({ length: 50 }, (_, i) => path.resolve(`r${50 - i}`)),
    );
  });

  test('moves a recent repository added again to the front', async () => {
    const storage = storageOf();
    const [r1, r2] = [path.resolve('r1'), path.resolve('r2')];
    await storage.addRecent(r1);
    await storage.addRecent(r2);
    await storage.addRecent(r1 + path.sep);
    assert.deepStrictEqual(storage.recent, [r1 + path.sep, r2]);
  });

  test('forgets a removed recent repository', async () => {
    const storage = storageOf();
    const [r1, r2] = [path.resolve('r1'), path.resolve('r2')];
    await storage.addRecent(r1);
    await storage.addRecent(r2);
    await storage.removeRecent(r1 + path.sep);
    assert.deepStrictEqual(storage.recent, [r2]);
  });
});
