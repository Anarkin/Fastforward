import * as assert from 'node:assert';
import * as path from 'node:path';
import { Storage, tabsKey } from '../storage';
import { FakeMemento } from './memento';

suite('Storage', () => {
  test('reads the bookmarks saved under vips, their first name', async () => {
    const globalState = new FakeMemento();
    const bookmarks = [{ kind: 'branch', name: 'main' }];
    await globalState.update('vips', { '/r': bookmarks });
    const storage = new Storage(new FakeMemento(), globalState);
    assert.deepStrictEqual(storage.bookmarksOf('/r'), bookmarks);
  });

  test('does not sync bookmarks, whose roots are paths on this machine', async () => {
    const globalState = new FakeMemento();
    const storage = new Storage(new FakeMemento(), globalState);
    await storage.setBookmarks('/r', [{ kind: 'branch', name: 'main' }]);
    assert.ok(globalState.synced.length > 0);
    assert.deepStrictEqual(
      globalState.keys().filter((key) => globalState.synced.includes(key)),
      [],
    );
  });

  test('reads a folder saved twice in the tabs as one tab', async () => {
    const workspaceState = new FakeMemento();
    const root = path.resolve('r');
    await workspaceState.update(tabsKey, [root, root + path.sep]);
    const storage = new Storage(workspaceState, new FakeMemento());
    assert.deepStrictEqual(storage.tabs, [root]);
  });

  test('finds a tab saved under another spelling of its folder', async () => {
    const storage = new Storage(new FakeMemento(), new FakeMemento());
    const root = path.resolve('r');
    await storage.setTabs([root], root);
    assert.ok(storage.hasTab(root + path.sep));
  });

  test('keeps one set of bookmarks for a folder spelled two ways', async () => {
    const globalState = new FakeMemento();
    const storage = new Storage(new FakeMemento(), globalState);
    const root = path.resolve('r');
    const main = [{ kind: 'branch', name: 'main' }] as const;
    await storage.setBookmarks(root, main);
    assert.deepStrictEqual(storage.bookmarksOf(root + path.sep), main);
    const dev = [{ kind: 'branch', name: 'dev' }] as const;
    await storage.setBookmarks(root + path.sep, dev);
    assert.deepStrictEqual(Object.keys(globalState.get<object>('vips', {})), [
      root,
    ]);
    assert.deepStrictEqual(storage.bookmarksOf(root), dev);
  });

  test('keeps the 20 newest recent repositories, newest first', async () => {
    const storage = new Storage(new FakeMemento(), new FakeMemento());
    for (let i = 0; i <= 20; i++) {
      await storage.addRecent(path.resolve(`r${i}`));
    }
    assert.deepStrictEqual(
      storage.recent,
      Array.from({ length: 20 }, (_, i) => path.resolve(`r${20 - i}`)),
    );
  });

  test('moves a recent repository added again to the front', async () => {
    const storage = new Storage(new FakeMemento(), new FakeMemento());
    const [r1, r2] = [path.resolve('r1'), path.resolve('r2')];
    await storage.addRecent(r1);
    await storage.addRecent(r2);
    await storage.addRecent(r1 + path.sep);
    assert.deepStrictEqual(storage.recent, [r1 + path.sep, r2]);
  });

  test('forgets a removed recent repository', async () => {
    const storage = new Storage(new FakeMemento(), new FakeMemento());
    const [r1, r2] = [path.resolve('r1'), path.resolve('r2')];
    await storage.addRecent(r1);
    await storage.addRecent(r2);
    await storage.removeRecent(r1 + path.sep);
    assert.deepStrictEqual(storage.recent, [r2]);
  });
});
