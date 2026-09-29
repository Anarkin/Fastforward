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
});
