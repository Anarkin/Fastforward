import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { UserSettings } from '../../../../../shell/main/userSettings';
import type { Store } from '../../../../../shell/main/stateFile';
import {
  bookmarksKey,
  GitStorage,
  recentKey,
  selectionsKey,
  soloKey,
  worktreesKey,
} from '../../../../../tools/git/main/storage';
import { lastFetchesKey } from '../../../../../tools/git/main/lastFetches';
import { comparisonOf } from '../../../../../tools/git/shared/comparisons';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import { FakeStore } from '../../../../helpers/fakeStore';
import { defaultSettings } from '../../../../helpers/fixtures';

function storageOf(state: Store = new FakeStore()): GitStorage {
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

  test('keeps solo per repository in the state, only where it differs from the default', async () => {
    const state = new FakeStore();
    const storage = storageOf(state);
    const root = path.resolve('r');
    await storage.setSolo(root, true);
    assert.deepStrictEqual(state.get('solo'), { [root]: true });
    await storage.setSolo(root, false);
    assert.deepStrictEqual(state.get('solo'), {});
  });

  test('keeps the commit, the file and the changes selected in each worktree for the next start, whatever the spelling of its folder', async () => {
    const state = new FakeStore();
    const storage = storageOf(state);
    const [r1, r2] = [path.resolve('r1'), path.resolve('r2')];
    const commit = 'a'.repeat(40);
    assert.strictEqual(storage.selectionOf(r1), undefined);
    await storage.setSelection(r1, { hash: commit, path: 'src/a.ts' });
    await storage.setSelection(r2, {
      hash: workingTreeHash,
      path: 'b.txt',
      area: 'staged',
    });
    await storage.setSelection(r1 + path.sep, { hash: commit, path: 'c.ts' });
    assert.deepStrictEqual(storageOf(state).selectionOf(r1), {
      hash: commit,
      path: 'c.ts',
    });
    assert.deepStrictEqual(storageOf(state).selectionOf(r2 + path.sep), {
      hash: workingTreeHash,
      path: 'b.txt',
      area: 'staged',
    });
    await storage.setSelection(r1, undefined);
    assert.strictEqual(storageOf(state).selectionOf(r1), undefined);
    assert.deepStrictEqual(Object.keys(state.get(selectionsKey) ?? {}), [r2]);
  });

  test('saves the selection of a worktree again only once it changes, as each commit and file selected saves it', async () => {
    const store = new FakeStore();
    const saved: string[] = [];
    const storage = storageOf({
      get: (key) => store.get(key),
      update: (key, value) => {
        saved.push(key);
        return store.update(key, value);
      },
    });
    const root = path.resolve('r');
    const commit = 'a'.repeat(40);
    await storage.setSelection(root, { hash: commit });
    await storage.setSelection(root, { hash: commit });
    await storage.setSelection(root, { hash: commit, path: 'a.txt' });
    await storage.setSelection(root, { hash: commit, path: 'a.txt' });
    await storage.setSelection(root, undefined);
    await storage.setSelection(root, undefined);
    assert.deepStrictEqual(saved, [
      selectionsKey,
      selectionsKey,
      selectionsKey,
    ]);
  });

  test('reads a selection of the wrong shape, as a hand edit can leave it, as none, handing git nothing but hashes', async () => {
    const store = new FakeStore();
    const commit = 'a'.repeat(40);
    const wrong = {
      short: { hash: 'abc' },
      option: { hash: '--output=x' },
      comparedWithOption: { hash: comparisonOf(commit, '--output=x') },
      noHash: { path: 'a.txt' },
      badPath: { hash: commit, path: 'a\0b' },
      badArea: { hash: workingTreeHash, area: 'index' },
      notAnObject: 'x',
    };
    const compared = { hash: comparisonOf(commit, workingTreeHash) };
    await store.update(selectionsKey, {
      ...Object.fromEntries(
        Object.entries(wrong).map(([name, value]) => [
          path.resolve(name),
          value,
        ]),
      ),
      [path.resolve('compared')]: compared,
    });
    const storage = storageOf(store);
    for (const name of Object.keys(wrong)) {
      assert.strictEqual(
        storage.selectionOf(path.resolve(name)),
        undefined,
        name,
      );
    }
    assert.deepStrictEqual(
      storage.selectionOf(path.resolve('compared')),
      compared,
    );
  });

  test('saves the recent repositories again only once they change, as each tab shown adds its repository', async () => {
    const store = new FakeStore();
    const saved: string[] = [];
    const storage = storageOf({
      get: (key) => store.get(key),
      update: (key, value) => {
        saved.push(key);
        return store.update(key, value);
      },
    });
    const [r1, r2] = [path.resolve('r1'), path.resolve('r2')];
    await storage.addRecent(r1);
    await storage.addRecent(r1);
    await storage.addRecent(r2);
    await storage.addRecent(r2);
    await storage.addRecent(r1);
    assert.deepStrictEqual(saved, [recentKey, recentKey, recentKey]);
    assert.deepStrictEqual(storage.recent, [r1, r2]);
  });

  test('forgets all it keeps of a repository and its worktrees, whatever their spelling, keeping that of the others', async () => {
    const store = new FakeStore();
    const storage = storageOf(store);
    const [gone, linked, kept] = ['gone', 'gone-linked', 'kept'].map((name) =>
      path.resolve(name),
    );
    const tags = new Map([['v1', 'a'.repeat(40)]]);
    const bookmarks = [{ kind: 'branch', name: 'main' }] as const;
    const selection = { hash: 'b'.repeat(40), path: 'a.txt' };
    for (const root of [gone, kept]) {
      await storage.setBookmarks(root, bookmarks);
      await storage.remoteTags.setRemoteTags(root, 'origin', tags);
      await storage.fetches.recordFetch(root, false, 1);
      await storage.setSolo(root, true);
      await storage.setSelection(root, selection);
    }
    await storage.setSolo(linked, true);
    await storage.setSelection(linked, selection);
    await storage.setWorktree(gone, linked);
    await storage.setWorktree(kept, `${kept}-linked`);
    await storage.fetches.recordFetch(gone, true, 2);

    await storage.forget(`${gone}${path.sep}`, [linked]);
    await storage.fetches.saveFetches();

    for (const reading of [storage, storageOf(store)]) {
      assert.strictEqual(reading.bookmarksOf(gone), undefined);
      assert.deepStrictEqual(reading.remoteTags.remoteTagsOf(gone), new Map());
      assert.deepStrictEqual(reading.fetches.lastFetchOf(gone), {});
      assert.strictEqual(reading.soloOf(gone), false);
      assert.strictEqual(reading.soloOf(linked), false);
      assert.strictEqual(reading.selectionOf(gone), undefined);
      assert.strictEqual(reading.selectionOf(linked), undefined);
      assert.deepStrictEqual(reading.selectionOf(kept), selection);
      assert.strictEqual(reading.worktreeOf(gone), gone);
      assert.deepStrictEqual(reading.bookmarksOf(kept), bookmarks);
      assert.deepStrictEqual(
        reading.remoteTags.remoteTagsOf(kept),
        new Map([['origin', tags]]),
      );
      assert.deepStrictEqual(reading.fetches.lastFetchOf(kept), {
        succeeded: 1,
      });
      assert.strictEqual(reading.soloOf(kept), true);
      assert.strictEqual(reading.worktreeOf(kept), `${kept}-linked`);
    }
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
    assert.deepStrictEqual(storage.fetches.lastFetchOf(root), { failed: 5 });
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
