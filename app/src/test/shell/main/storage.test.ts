import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { UserSettings } from '../../../shell/main/settings';
import { plainOf, strings } from '../../../lib/shared/strings';
import {
  activeTabKey,
  JsonFileStore,
  migratedState,
  Storage,
  tabsKey,
  toolState,
  windowsKey,
} from '../../../shell/main/storage';
import { FakeStore } from '../../fakeStore';
import { defaultSettings } from '../../fixtures';
import { removeFolder, tempFolder } from '../../repositories';

const terminalTab = (id: string) => ({ id, tool: 'terminal' }) as const;

function storageOf(state = new FakeStore()): Storage {
  return new Storage(new UserSettings(defaultSettings()), state);
}

suite('Storage', () => {
  test('takes how many recent items the + menu lists for each tool from the settings, fifteen unless set, as a whole number from none to fifty', () => {
    assert.strictEqual(storageOf().recentFolders, 15);
    for (const [set, taken] of [
      [8, 8],
      [7.6, 8],
      [-3, 0],
      [500, 50],
      [Number.NaN, 0],
    ]) {
      const settings = new UserSettings({
        ...defaultSettings(),
        tabs: { ...defaultSettings().tabs, recentFolders: set },
      });
      assert.strictEqual(
        new Storage(settings, new FakeStore()).recentFolders,
        taken,
        String(set),
      );
    }
  });

  test('takes how many rows a notch of the mouse wheel scrolls from the settings, ten unless set, as a whole number from one to fifty', () => {
    assert.strictEqual(storageOf().wheelRows, 10);
    for (const [set, taken] of [
      [3, 3],
      [2.6, 3],
      [0, 1],
      [-3, 1],
      [500, 50],
      [Number.NaN, 1],
    ]) {
      const settings = new UserSettings({
        ...defaultSettings(),
        scrolling: { ...defaultSettings().scrolling, wheelRows: set },
      });
      assert.strictEqual(
        new Storage(settings, new FakeStore()).wheelRows,
        taken,
        String(set),
      );
    }
  });

  test('glides when scrolling by rows only once the settings turn it on', () => {
    assert.strictEqual(storageOf().smoothScrolling, false);
    const settings = new UserSettings({
      ...defaultSettings(),
      scrolling: { ...defaultSettings().scrolling, smooth: true },
    });
    assert.strictEqual(
      new Storage(settings, new FakeStore()).smoothScrolling,
      true,
    );
  });

  test('reads state of the wrong shape, as a hand edit can leave it, as never saved', async () => {
    const store = new FakeStore();
    await store.update(tabsKey, 5);
    await store.update(activeTabKey, 5);
    const storage = storageOf(store);
    assert.deepStrictEqual(storage.savedTabs, []);
    assert.deepStrictEqual(storage.layout, [{ id: '1', tabs: [] }]);
  });

  test('leaves out the tabs of the wrong shape', async () => {
    const store = new FakeStore();
    const root = path.resolve('r');
    const tab = { id: '1', tool: 'git', root };
    await store.update(tabsKey, [
      tab,
      root,
      { id: '2', tool: 'x' },
      { id: 3, tool: 'commander' },
      { id: '4', tool: 'commander', root: 4 },
      { id: '5', tool: 'commander', root, view: 'yes' },
    ]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [tab]);
  });

  test('keeps a tab that views a file as one, read and written', async () => {
    const store = new FakeStore();
    const file = path.resolve('notes.txt');
    const tab = { id: '1', tool: 'commander', root: file, view: true } as const;
    await store.update(tabsKey, [tab]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [tab]);

    const written = new FakeStore();
    await storageOf(written).setLayout([{ id: '1', tabs: [tab], active: '1' }]);
    assert.deepStrictEqual(written.get(tabsKey), [tab]);
  });

  test('keeps a tab that edits a file as one, read and written, apart from one viewing it', async () => {
    const store = new FakeStore();
    const file = path.resolve('notes.txt');
    const tab = { id: '1', tool: 'commander', root: file, edit: true } as const;
    const viewing = {
      id: '2',
      tool: 'commander',
      root: file,
      view: true,
    } as const;
    await store.update(tabsKey, [
      tab,
      viewing,
      { id: '3', tool: 'commander', root: file, edit: 'yes' },
    ]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [tab, viewing]);

    const written = new FakeStore();
    await storageOf(written).setLayout([
      { id: '1', tabs: [tab, viewing], active: '1' },
    ]);
    assert.deepStrictEqual(written.get(tabsKey), [tab, viewing]);
  });

  test('keeps a tab that compares two files as one, read and written, dropping a comparison not of two paths', async () => {
    const store = new FakeStore();
    const compare = {
      old: path.resolve('old.txt'),
      new: path.resolve('new.txt'),
    };
    const tab = { id: '1', tool: 'git', compare } as const;
    await store.update(tabsKey, [
      tab,
      { id: '2', tool: 'git', compare: { old: 'a' } },
      { id: '3', tool: 'git', compare: 'a' },
    ]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [tab]);

    const written = new FakeStore();
    await storageOf(written).setLayout([{ id: '1', tabs: [tab], active: '1' }]);
    assert.deepStrictEqual(written.get(tabsKey), [tab]);
  });

  test("keeps each tool's state apart under tools, by the tool's id, forgetting a value set to nothing", async () => {
    const store = new FakeStore();
    const git = toolState(store, 'git');
    await git.update('recentRepositories', ['/r']);
    await toolState(store, 'commander').update('recentRepositories', ['/f']);
    assert.deepStrictEqual(git.get('recentRepositories'), ['/r']);
    assert.deepStrictEqual(store.get('tools'), {
      git: { recentRepositories: ['/r'] },
      commander: { recentRepositories: ['/f'] },
    });
    await git.update('recentRepositories', undefined);
    assert.deepStrictEqual(store.get('tools'), {
      git: {},
      commander: { recentRepositories: ['/f'] },
    });
  });

  test('takes in the tabs and the windows together, before either is written', async () => {
    const written = Promise.withResolvers<void>();
    const store = new FakeStore();
    store.update = (key, value) => {
      store.values.set(key, value);
      return written.promise;
    };
    const storage = storageOf(store);
    const tabs = [
      { id: '1', tool: 'git', root: path.resolve('one') },
      { id: '2', tool: 'commander' },
    ] as const;
    const saved = storage.setLayout([{ id: '1', tabs, active: '2' }]);
    assert.deepStrictEqual(storage.savedTabs, tabs);
    assert.deepStrictEqual(storage.layout, [{ id: '1', tabs, active: '2' }]);
    written.resolve();
    await saved;
  });

  test('reads the saved tabs once until they change, as every message a tool posts asks which tab is open', async () => {
    const storage = storageOf();
    await storage.setLayout([
      { id: '1', tabs: [{ id: '1', tool: 'commander' }], active: '1' },
    ]);
    const read = storage.savedTabs;
    const layout = storage.layout;
    assert.strictEqual(storage.savedTabs, read);
    assert.strictEqual(storage.layout, layout);
    await storage.setLayout([
      { id: '1', tabs: [{ id: '2', tool: 'terminal' }], active: '2' },
    ]);
    assert.deepStrictEqual(storage.savedTabs, [{ id: '2', tool: 'terminal' }]);
  });

  test('reads a tab saved twice under one id as one tab', async () => {
    const store = new FakeStore();
    const root = path.resolve('r');
    await store.update(tabsKey, [
      { id: '1', tool: 'git', root },
      { id: '1', tool: 'commander' },
    ]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [
      { id: '1', tool: 'git', root },
    ]);
  });

  test('puts every saved tab in one window, showing the one that was active, when the state holds no windows, as the app had a single window before', async () => {
    const store = new FakeStore();
    const tabs = [
      { id: '1', tool: 'terminal' },
      { id: '2', tool: 'commander' },
    ] as const;
    await store.update(tabsKey, tabs);
    await store.update(activeTabKey, '2');
    assert.deepStrictEqual(storageOf(store).layout, [
      { id: '1', tabs, active: '2' },
    ]);
  });

  test('keeps each tab in the first window that lists it, adds the tabs no window lists to the first window and drops the rest a window names, as a hand edit can leave the windows at odds with the tabs', async () => {
    const store = new FakeStore();
    await store.update(tabsKey, [
      terminalTab('1'),
      terminalTab('2'),
      terminalTab('3'),
      terminalTab('4'),
    ]);
    await store.update(windowsKey, [
      { id: '8', tabs: ['2', '1'], active: '1' },
      { id: '7', tabs: ['9', 5], active: '9' },
      { id: '8', tabs: ['4'] },
      { id: 'no tabs' },
      { id: '9', tabs: ['1', '3'], active: '1' },
    ]);
    assert.deepStrictEqual(storageOf(store).layout, [
      {
        id: '8',
        tabs: [terminalTab('2'), terminalTab('1'), terminalTab('4')],
        active: '1',
      },
      { id: '7', tabs: [] },
      { id: '9', tabs: [terminalTab('3')] },
    ]);
  });

  test('keeps a window with no tab among the others, as a window opened anew holds none until one opens in it', async () => {
    const store = new FakeStore();
    await store.update(tabsKey, [terminalTab('1')]);
    await store.update(windowsKey, [
      { id: '1', tabs: ['1'], active: '1' },
      { id: '2', tabs: [] },
    ]);
    assert.deepStrictEqual(storageOf(store).layout, [
      { id: '1', tabs: [terminalTab('1')], active: '1' },
      { id: '2', tabs: [] },
    ]);
  });

  test('keeps a single window with no tab, as the last window stays open once its last tab closes', async () => {
    const store = new FakeStore();
    await store.update(tabsKey, []);
    await store.update(windowsKey, [{ id: '4', tabs: [] }]);
    assert.deepStrictEqual(storageOf(store).layout, [{ id: '4', tabs: [] }]);
  });

  test('saves the tabs of every window in one list, window by window, and each window as the ids of its tabs and its active one, forgetting the active tab kept for the single window of before', async () => {
    const store = new FakeStore();
    await store.update(activeTabKey, '1');
    await storageOf(store).setLayout([
      { id: '1', tabs: [terminalTab('2'), terminalTab('1')], active: '1' },
      { id: '3', tabs: [terminalTab('3')] },
    ]);
    assert.deepStrictEqual(store.get(tabsKey), [
      terminalTab('2'),
      terminalTab('1'),
      terminalTab('3'),
    ]);
    assert.deepStrictEqual(store.get(windowsKey), [
      { id: '1', tabs: ['2', '1'], active: '1' },
      { id: '3', tabs: ['3'] },
    ]);
    assert.strictEqual(store.get(activeTabKey), undefined);
  });

  test('reads a thousand tabs without comparing every pair of them', async () => {
    const store = new FakeStore();
    await store.update(
      tabsKey,
      Array.from({ length: 1000 }, (_, i) => ({
        id: String(i),
        tool: 'git',
        root: path.resolve(`r${i}`),
      })),
    );
    const storage = storageOf(store);
    const started = performance.now();
    assert.strictEqual(storage.savedTabs.length, 1000);
    assert.ok(performance.now() - started < 200);
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

  test('takes in the tabs and the state of the git client as version 22 kept them, at the top of the file, saving them where they are kept now', async () => {
    const bookmark = { name: 'main', kind: 'branch' };
    fs.writeFileSync(
      file,
      JSON.stringify({
        tabs: ['/a', '/b'],
        activeTab: '/b',
        recentRepositories: ['/b', '/a'],
        solo: { '/a': true },
        bookmarks: { '/a': [bookmark] },
        activeWorktrees: { '/a': '/a-feature' },
        lastFetches: { '/a': { succeeded: 5 } },
        remoteTags: { '/a': { origin: { v1: 'a'.repeat(40) } } },
        tabsGrouped: true,
        terminalCommandOffered: true,
        bounds: { x: 1, y: 2, width: 3, height: 4 },
      }),
    );
    const store = new JsonFileStore(file, migratedState);
    const storage = new Storage(new UserSettings(defaultSettings()), store);
    assert.deepStrictEqual(storage.savedTabs, [
      { id: '1', tool: 'git', root: '/a' },
      { id: '2', tool: 'git', root: '/b' },
    ]);
    assert.strictEqual(storage.layout[0]?.active, '2');
    await store.saved();
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      tabs: [
        { id: '1', tool: 'git', root: '/a' },
        { id: '2', tool: 'git', root: '/b' },
      ],
      activeTab: '2',
      terminalCommandOffered: true,
      bounds: { x: 1, y: 2, width: 3, height: 4 },
      tools: {
        git: {
          recentRepositories: ['/b', '/a'],
          solo: { '/a': true },
          bookmarks: { '/a': [bookmark] },
          activeWorktrees: { '/a': '/a-feature' },
          lastFetches: { '/a': { succeeded: 5 } },
          remoteTags: { '/a': { origin: { v1: 'a'.repeat(40) } } },
        },
      },
    });
  });

  test('keeps the state of the git client as it is kept now over what version 22 left at the top of the file, dropping the older, and leaves a file of today alone', async () => {
    const today = {
      tabs: [{ id: '4', tool: 'terminal' }],
      activeTab: '4',
      tools: { git: { recentRepositories: ['/new'] } },
    };
    fs.writeFileSync(
      file,
      JSON.stringify({ ...today, recentRepositories: ['/old'], solo: {} }),
    );
    const store = new JsonFileStore(file, migratedState);
    await store.saved();
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      ...today,
      tools: { git: { recentRepositories: ['/new'], solo: {} } },
    });
    const written = fs.statSync(file).mtimeMs;
    const again = new JsonFileStore(file, migratedState);
    await again.saved();
    assert.strictEqual(fs.statSync(file).mtimeMs, written);
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

  test("keeps each tool's state the file held once it can be read, under the changes made to it since, as every tool keeps its state under the one key", async () => {
    fs.mkdirSync(file);
    const store = new JsonFileStore(file);
    const git = toolState(store, 'git');
    await git.update('lastFetches', { '/a': 1 });
    await git.update('solo', ['/a']);
    await git.update('solo', undefined);
    fs.rmdirSync(file);
    fs.writeFileSync(
      file,
      JSON.stringify({
        tools: {
          git: {
            recentRepositories: ['/old'],
            bookmarks: { '/old': ['b'] },
            solo: ['/old'],
            lastFetches: { '/old': 2 },
          },
          files: { recentRepositories: ['/f'] },
        },
      }),
    );
    await git.update('recentRepositories', ['/new']);
    const expected = {
      git: {
        recentRepositories: ['/new'],
        bookmarks: { '/old': ['b'] },
        lastFetches: { '/old': 2, '/a': 1 },
      },
      files: { recentRepositories: ['/f'] },
    };
    assert.deepStrictEqual(store.get('tools'), expected);
    assert.deepStrictEqual(new JsonFileStore(file).get('tools'), expected);
  });

  test('says why the file could not be read', () => {
    fs.mkdirSync(file);
    const [problem] = new JsonFileStore(file).problems;
    assert.match(
      plainOf(problem),
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
      plainOf(problem),
      /^The saved state was broken and could not be put aside, so it starts afresh: /,
    );
    await store.update('solo', true);
    assert.strictEqual(new JsonFileStore(file).get('solo'), true);
  });
});
