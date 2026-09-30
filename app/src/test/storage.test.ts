import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { JsonFileStore, Storage, tabsKey } from '../storage';
import { FakeStore } from './fakeStore';

suite('Storage', () => {
  test('reads the bookmarks saved under vips, their first name', async () => {
    const store = new FakeStore();
    const bookmarks = [{ kind: 'branch', name: 'main' }];
    await store.update('vips', { '/r': bookmarks });
    const storage = new Storage(store);
    assert.deepStrictEqual(storage.bookmarksOf('/r'), bookmarks);
  });

  test('lays out a new view with merges collapsed and the changes as a tree', () => {
    const storage = new Storage(new FakeStore());
    assert.deepStrictEqual(storage.layout, {
      type: 'layout',
      columnWidths: undefined,
      collapseMerges: true,
      entireFilePinned: false,
      filesMode: 'changes',
      changesView: 'tree',
    });
  });

  test('reads a folder saved twice in the tabs as one tab', async () => {
    const store = new FakeStore();
    const root = path.resolve('r');
    await store.update(tabsKey, [root, root + path.sep]);
    const storage = new Storage(store);
    assert.deepStrictEqual(storage.tabs, [root]);
  });

  test('finds a tab saved under another spelling of its folder', async () => {
    const storage = new Storage(new FakeStore());
    const root = path.resolve('r');
    await storage.setTabs([root], root);
    assert.ok(storage.hasTab(root + path.sep));
  });

  test('keeps one set of bookmarks for a folder spelled two ways', async () => {
    const store = new FakeStore();
    const storage = new Storage(store);
    const root = path.resolve('r');
    const main = [{ kind: 'branch', name: 'main' }] as const;
    await storage.setBookmarks(root, main);
    assert.deepStrictEqual(storage.bookmarksOf(root + path.sep), main);
    const dev = [{ kind: 'branch', name: 'dev' }] as const;
    await storage.setBookmarks(root + path.sep, dev);
    assert.deepStrictEqual(Object.keys(store.get<object>('vips', {})), [root]);
    assert.deepStrictEqual(storage.bookmarksOf(root), dev);
  });

  test('turns solo on and off for one repository, whatever the spelling of its folder', async () => {
    const storage = new Storage(new FakeStore());
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

  test('keeps the 20 newest recent repositories, newest first', async () => {
    const storage = new Storage(new FakeStore());
    for (let i = 0; i <= 20; i++) {
      await storage.addRecent(path.resolve(`r${i}`));
    }
    assert.deepStrictEqual(
      storage.recent,
      Array.from({ length: 20 }, (_, i) => path.resolve(`r${20 - i}`)),
    );
  });

  test('moves a recent repository added again to the front', async () => {
    const storage = new Storage(new FakeStore());
    const [r1, r2] = [path.resolve('r1'), path.resolve('r2')];
    await storage.addRecent(r1);
    await storage.addRecent(r2);
    await storage.addRecent(r1 + path.sep);
    assert.deepStrictEqual(storage.recent, [r1 + path.sep, r2]);
  });

  test('forgets a removed recent repository', async () => {
    const storage = new Storage(new FakeStore());
    const [r1, r2] = [path.resolve('r1'), path.resolve('r2')];
    await storage.addRecent(r1);
    await storage.addRecent(r2);
    await storage.removeRecent(r1 + path.sep);
    assert.deepStrictEqual(storage.recent, [r2]);
  });
});

suite('Settings file', () => {
  let folder: string;
  let file: string;

  setup(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-store-'));
    file = path.join(folder, 'settings.json');
  });

  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));

  test('keeps what was saved for the next start', async () => {
    const store = new JsonFileStore(file);
    await store.update('solo', true);
    await store.update('tabs', ['/a']);
    const reopened = new JsonFileStore(file);
    assert.strictEqual(reopened.get('solo', false), true);
    assert.deepStrictEqual(reopened.get('tabs'), ['/a']);
    assert.strictEqual(reopened.get('missing'), undefined);
  });

  test('forgets a value set to nothing', async () => {
    const store = new JsonFileStore(file);
    await store.update('activeTab', '/a');
    await store.update('activeTab', undefined);
    assert.strictEqual(
      new JsonFileStore(file).get('activeTab', 'none'),
      'none',
    );
  });

  test('saves the last of several quick changes', async () => {
    const store = new JsonFileStore(file);
    await Promise.all([1, 2, 3].map((n) => store.update('n', n)));
    assert.strictEqual(new JsonFileStore(file).get('n'), 3);
  });

  test('starts afresh from a broken file, keeping a copy of it', () => {
    fs.writeFileSync(file, '{ broken');
    const store = new JsonFileStore(file);
    assert.strictEqual(store.get('tabs'), undefined);
    assert.strictEqual(fs.readFileSync(`${file}.corrupt`, 'utf8'), '{ broken');
  });
});
