import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { UserSettings } from '../settings';
import { strings } from '../shared/strings';
import {
  activeTabKey,
  bookmarksKey,
  JsonFileStore,
  lastFetchesKey,
  recentKey,
  remoteTagsKey,
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
      showWhitespace: defaults.showWhitespace,
      diffLayout: defaults.diffLayout,
      showAllFiles: defaults.showAllFiles,
      autoFetch: defaults.autoFetch,
      autoFetchMinutes: defaults.autoFetchMinutes,
      hideDimmedButtons: false,
    });
  });

  test('fetches at most every 35791 minutes, as seldom as a timer can wait, and tells the page so, as it says how often it fetches and when a fetch is late by it', () => {
    const storage = new Storage(
      new UserSettings({
        ...defaultSettings(),
        autoFetch: true,
        autoFetchMinutes: 50_000,
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

  beforeEach(() => {
    folder = tempFolder('state');
    file = path.join(folder, 'state.json');
  });

  afterEach(() => removeFolder(folder));

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
    fs.writeFileSync(file, '\uFEFF{"solo": true}');
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

  test('saves again once a file that could not be read at first can be, keeping what it held under the changes made since', async () => {
    fs.mkdirSync(file);
    const store = new JsonFileStore(file);
    await store.update('tabs', ['/a']);
    fs.rmdirSync(file);
    fs.writeFileSync(
      file,
      JSON.stringify({ tabs: ['/old'], activeTab: '/old' }),
    );
    await store.update('solo', true);
    assert.deepStrictEqual(store.get('activeTab'), '/old');
    const reopened = new JsonFileStore(file);
    assert.deepStrictEqual(reopened.get('tabs'), ['/a']);
    assert.strictEqual(reopened.get('activeTab'), '/old');
    assert.strictEqual(reopened.get('solo'), true);
  });

  test('forgets a value set to nothing while the file could not be read, once it can be', async () => {
    fs.mkdirSync(file);
    const store = new JsonFileStore(file);
    await store.update('activeTab', undefined);
    fs.rmdirSync(file);
    fs.writeFileSync(
      file,
      JSON.stringify({ tabs: ['/old'], activeTab: '/old' }),
    );
    await store.update('solo', true);
    assert.strictEqual(store.get('activeTab'), undefined);
    const reopened = new JsonFileStore(file);
    assert.strictEqual(reopened.get('activeTab'), undefined);
    assert.deepStrictEqual(reopened.get('tabs'), ['/old']);
  });

  test('says why the file could not be read', () => {
    fs.mkdirSync(file);
    const [problem] = new JsonFileStore(file).problems;
    assert.match(
      problem,
      /^The saved state could not be read, so changes to it are kept until it can be: /,
    );
  });

  test('starts afresh from a broken file, keeping a copy of it, and says so', () => {
    fs.writeFileSync(file, '{ broken');
    const store = new JsonFileStore(file);
    assert.strictEqual(store.get('tabs'), undefined);
    assert.strictEqual(fs.readFileSync(`${file}.corrupt`, 'utf8'), '{ broken');
    assert.deepStrictEqual(store.problems, [
      strings.state.putAside(`${file}.corrupt`),
    ]);
  });

  test('starts afresh from a broken file it cannot keep a copy of, saying why, rather than failing to start', async () => {
    fs.writeFileSync(file, '{ broken');
    fs.mkdirSync(`${file}.corrupt`);
    const store = new JsonFileStore(file);
    assert.strictEqual(store.get('tabs'), undefined);
    const [problem] = store.problems;
    assert.match(
      problem,
      /^The saved state was broken and could not be put aside, so it starts afresh: /,
    );
    await store.update('solo', true);
    assert.strictEqual(new JsonFileStore(file).get('solo'), true);
  });
});
