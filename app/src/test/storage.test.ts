import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { UserSettings } from '../settings';
import {
  activeTabKey,
  bookmarksKey,
  JsonFileStore,
  lastFetchesKey,
  recentKey,
  soloKey,
  Storage,
  tabsKey,
  worktreesKey,
} from '../storage';
import { FakeStore } from './fakeStore';
import { defaultSettings } from './fixtures';
import { removeFolder, tempFolder } from './repositories';

function storageOf(state = new FakeStore()): Storage {
  return new Storage(new UserSettings(defaultSettings()), state);
}

suite('Storage', () => {
  test('reads the bookmarks saved in the state', async () => {
    const store = new FakeStore();
    const bookmarks = [{ kind: 'branch', name: 'main' }];
    await store.update('bookmarks', { '/r': bookmarks });
    const storage = storageOf(store);
    assert.deepStrictEqual(storage.bookmarksOf('/r'), bookmarks);
  });

  test('lays out a new view as the default settings say', () => {
    const defaults = defaultSettings();
    assert.deepStrictEqual(storageOf().layout, {
      type: 'layout',
      columnWidths: defaults.columnWidths,
      defaultColumnWidths: defaults.columnWidths,
      collapseMerges: defaults.collapseMerges,
      entireFilePinned: defaults.entireFilePinned,
      ignoreWhitespace: defaults.ignoreWhitespace,
      wordWrap: defaults.wordWrap,
      diffLayout: defaults.diffLayout,
      showAllFiles: defaults.showAllFiles,
      autoFetch: defaults.autoFetch,
      autoFetchMinutes: defaults.autoFetchMinutes,
    });
  });

  test('fetches at most as seldom as a timer can wait', () => {
    const storage = new Storage(
      new UserSettings({
        ...defaultSettings(),
        autoFetch: true,
        autoFetchMinutes: 50_000,
      }),
      new FakeStore(),
    );
    assert.ok(storage.autoFetchMinutes * 60_000 <= 2 ** 31 - 1);
    assert.ok(storage.autoFetchMinutes > 35_000);
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

  test('reads state of the wrong shape, as a hand edit can leave it, as never saved', async () => {
    const store = new FakeStore();
    const root = path.resolve('r');
    await store.update(tabsKey, 5);
    await store.update(activeTabKey, 5);
    await store.update(recentKey, 'x');
    await store.update(bookmarksKey, { [root]: 'x' });
    await store.update(soloKey, { [root]: 'yes' });
    await store.update(lastFetchesKey, {
      [root]: { succeeded: 'x', failed: 5 },
    });
    const storage = storageOf(store);
    assert.deepStrictEqual(storage.lastFetchOf(root), { failed: 5 });
    assert.deepStrictEqual(storage.tabs, []);
    assert.strictEqual(storage.activeTab, undefined);
    assert.deepStrictEqual(storage.recent, []);
    assert.strictEqual(storage.bookmarksOf(root), undefined);
    assert.strictEqual(storage.soloOf(root), defaultSettings().solo);
    await storage.addRecent(root);
    assert.deepStrictEqual(storage.recent, [root]);
  });

  test('leaves out the entries of the wrong shape from saved lists', async () => {
    const store = new FakeStore();
    const root = path.resolve('r');
    const main = { kind: 'branch', name: 'main' };
    await store.update(tabsKey, [root, 3]);
    await store.update(recentKey, [null, root]);
    await store.update(bookmarksKey, {
      [root]: [main, { kind: 'x', name: 'y' }, { kind: 'tag' }, 5],
    });
    const storage = storageOf(store);
    assert.deepStrictEqual(storage.tabs, [root]);
    assert.deepStrictEqual(storage.recent, [root]);
    assert.deepStrictEqual(storage.bookmarksOf(root), [main]);
  });

  test('takes in the tabs and the active one together, before either is written', async () => {
    const written = Promise.withResolvers<void>();
    const store = new FakeStore();
    store.update = (key, value) => {
      store.values.set(key, value);
      return written.promise;
    };
    const storage = storageOf(store);
    const [one, two] = [path.resolve('one'), path.resolve('two')];
    const saved = storage.setTabs([one, two], two);
    assert.deepStrictEqual(storage.tabs, [one, two]);
    assert.strictEqual(storage.activeTab, two);
    written.resolve();
    await saved;
  });

  test('reads a folder saved twice in the tabs as one tab', async () => {
    const store = new FakeStore();
    const root = path.resolve('r');
    await store.update(tabsKey, [root, root + path.sep]);
    const storage = storageOf(store);
    assert.deepStrictEqual(storage.tabs, [root]);
  });

  test('finds a tab saved under another spelling of its folder', async () => {
    const storage = storageOf();
    const root = path.resolve('r');
    await storage.setTabs([root], root);
    assert.ok(storage.hasTab(root + path.sep));
  });

  test('finds a tab among a thousand without comparing every pair of them', async () => {
    const store = new FakeStore();
    const roots = Array.from({ length: 1000 }, (_, i) => path.resolve(`r${i}`));
    await store.update(tabsKey, roots);
    const storage = storageOf(store);
    const started = performance.now();
    assert.ok(storage.hasTab(path.resolve('r999')));
    assert.ok(!storage.hasTab(path.resolve('missing')));
    assert.ok(performance.now() - started < 200);
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
    await storage.setTabs([repository], repository);
    assert.strictEqual(storage.activeWorktree, repository);
    await storage.setWorktree(repository + path.sep, linked);
    assert.strictEqual(storage.worktreeOf(repository), linked);
    assert.strictEqual(storage.activeWorktree, linked);
    await storage.setWorktree(repository, repository + path.sep);
    assert.deepStrictEqual(store.values.get(worktreesKey), {});
    assert.strictEqual(storage.activeWorktree, repository);
  });

  test('keeps the 20 newest recent repositories, newest first', async () => {
    const storage = storageOf();
    for (let i = 0; i <= 20; i++) {
      await storage.addRecent(path.resolve(`r${i}`));
    }
    assert.deepStrictEqual(
      storage.recent,
      Array.from({ length: 20 }, (_, i) => path.resolve(`r${20 - i}`)),
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

suite('State file', () => {
  let folder: string;
  let file: string;

  setup(() => {
    folder = tempFolder('state');
    file = path.join(folder, 'state.json');
  });

  teardown(() => removeFolder(folder));

  test('keeps what was saved for the next start', async () => {
    const store = new JsonFileStore(file);
    await store.update('solo', true);
    await store.update('tabs', ['/a']);
    const reopened = new JsonFileStore(file);
    assert.strictEqual(reopened.get('solo'), true);
    assert.deepStrictEqual(reopened.get('tabs'), ['/a']);
    assert.strictEqual(reopened.get('missing'), undefined);
  });

  test('reads a file saved with a byte order mark, as Notepad saved UTF-8 before Windows 10 1903', () => {
    fs.writeFileSync(file, '﻿{"solo": true}');
    assert.strictEqual(new JsonFileStore(file).get('solo'), true);
    assert.ok(!fs.existsSync(`${file}.corrupt`));
  });

  test('forgets a value set to nothing', async () => {
    const store = new JsonFileStore(file);
    await store.update('activeTab', '/a');
    await store.update('activeTab', undefined);
    assert.strictEqual(new JsonFileStore(file).get('activeTab'), undefined);
  });

  test('saves the last of several quick changes', async () => {
    const store = new JsonFileStore(file);
    await Promise.all([1, 2, 3].map((n) => store.update('n', n)));
    assert.strictEqual(new JsonFileStore(file).get('n'), 3);
  });

  test('writes changes made while a write waits to start in that one write', async () => {
    const store = new JsonFileStore(file);
    const rename = fs.promises.rename;
    let writes = 0;
    Reflect.set(fs.promises, 'rename', (...args: Parameters<typeof rename>) => {
      writes++;
      return rename(...args);
    });
    try {
      await Promise.all([
        store.update('tabs', ['/a']),
        store.update('activeTab', '/a'),
        store.update('recentRepositories', ['/a']),
      ]);
      await store.update('solo', true);
    } finally {
      Reflect.set(fs.promises, 'rename', rename);
    }
    assert.strictEqual(writes, 2);
    const reopened = new JsonFileStore(file);
    assert.strictEqual(reopened.get('activeTab'), '/a');
    assert.deepStrictEqual(reopened.get('recentRepositories'), ['/a']);
    assert.strictEqual(reopened.get('solo'), true);
  });

  test('keeps changes to itself when the file is there but cannot be read', async () => {
    fs.mkdirSync(file);
    const store = new JsonFileStore(file);
    await store.update('tabs', ['/a']);
    assert.deepStrictEqual(store.get('tabs'), ['/a']);
    assert.ok(fs.statSync(file).isDirectory());
    assert.ok(!fs.existsSync(`${file}.tmp`));
  });

  test('starts afresh from a broken file, keeping a copy of it', () => {
    fs.writeFileSync(file, '{ broken');
    const store = new JsonFileStore(file);
    assert.strictEqual(store.get('tabs'), undefined);
    assert.strictEqual(fs.readFileSync(`${file}.corrupt`, 'utf8'), '{ broken');
  });
});
