import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { UserSettings } from '../../../../shell/main/userSettings';
import {
  activeTabKey,
  Storage,
  tabsKey,
  toolState,
  windowsKey,
} from '../../../../shell/main/storage';
import { FakeStore } from '../../../helpers/fakeStore';
import { defaultSettings } from '../../../helpers/fixtures';

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

  test('takes how long the pointer rests on a character drawn as a sign before its tooltip shows from a setting of its own, at once unless set, in whole milliseconds from none to ten seconds, so the characters can answer at once while the buttons wait', () => {
    assert.strictEqual(storageOf().characterTipDelay, 0);
    for (const [set, taken] of [
      [250.6, 251],
      [-5, 0],
      [60_000, 10_000],
      [Number.NaN, 0],
    ]) {
      const settings = new UserSettings({
        ...defaultSettings(),
        tooltips: { delayMilliseconds: 500, characterDelayMilliseconds: set },
      });
      assert.strictEqual(
        new Storage(settings, new FakeStore()).characterTipDelay,
        taken,
        String(set),
      );
    }
  });

  test('takes how long the pointer rests on something before its tooltip shows from the settings, half a second unless set, in whole milliseconds from none to ten seconds', () => {
    assert.strictEqual(storageOf().tipDelay, 500);
    for (const [set, taken] of [
      [0, 0],
      [120.4, 120],
      [-5, 0],
      [60_000, 10_000],
      [Number.NaN, 500],
    ]) {
      const settings = new UserSettings({
        ...defaultSettings(),
        tooltips: { delayMilliseconds: set, characterDelayMilliseconds: 0 },
      });
      assert.strictEqual(
        new Storage(settings, new FakeStore()).tipDelay,
        taken,
        String(set),
      );
    }
  });

  test('takes how long a notice stays from the settings, in seconds, 6 to 15 by its length and 20 to 45 for an error unless set, each a second at the least and the most no less than the least', () => {
    assert.deepStrictEqual(storageOf().noticeTimes, {
      least: 6000,
      most: 15_000,
      errorLeast: 20_000,
      errorMost: 45_000,
    });
    const settings = new UserSettings({
      ...defaultSettings(),
      notices: {
        info: { leastSeconds: 2.5, mostSeconds: 1 },
        error: { leastSeconds: 0, mostSeconds: Number.NaN },
      },
    });
    assert.deepStrictEqual(new Storage(settings, new FakeStore()).noticeTimes, {
      least: 2500,
      most: 2500,
      errorLeast: 1000,
      errorMost: 45_000,
    });
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

  test('glides when scrolling by rows unless the settings turn it off', () => {
    assert.strictEqual(storageOf().smoothScrolling, true);
    const settings = new UserSettings({
      ...defaultSettings(),
      scrolling: { ...defaultSettings().scrolling, smooth: false },
    });
    assert.strictEqual(
      new Storage(settings, new FakeStore()).smoothScrolling,
      false,
    );
  });

  test('settles a list on a whole row once a scrollbar or a touchpad that moved it by pixels is let go, as scrolling that glides does unless the settings turn that off', () => {
    assert.strictEqual(storageOf().smoothSnap, true);
    const settings = new UserSettings({
      ...defaultSettings(),
      scrolling: { ...defaultSettings().scrolling, smoothSnap: false },
    });
    assert.strictEqual(
      new Storage(settings, new FakeStore()).smoothSnap,
      false,
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
    const tab = { id: '1', tool: 'viewer', root: file } as const;
    await store.update(tabsKey, [tab]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [tab]);

    const written = new FakeStore();
    await storageOf(written).setLayout([{ id: '1', tabs: [tab], active: '1' }]);
    assert.deepStrictEqual(written.get(tabsKey), [tab]);
  });

  test('reads a tab of the commander that viewed or edited a file, saved before the viewer and the editor were tools of their own, as a tab of the viewer or the editor with the same id', async () => {
    const store = new FakeStore();
    const file = path.resolve('notes.txt');
    await store.update(tabsKey, [
      { id: '1', tool: 'commander', root: file, view: true },
      { id: '2', tool: 'commander', root: file, view: true, edit: true },
      { id: '3', tool: 'commander', root: file, edit: true },
    ]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [
      { id: '1', tool: 'viewer', root: file },
      { id: '3', tool: 'editor', root: file },
    ]);
  });

  test('keeps a tab that edits a file as one, read and written, apart from one viewing it', async () => {
    const store = new FakeStore();
    const file = path.resolve('notes.txt');
    const tab = { id: '1', tool: 'editor', root: file } as const;
    const viewing = { id: '2', tool: 'viewer', root: file } as const;
    await store.update(tabsKey, [
      tab,
      viewing,
      { id: '3', tool: 'editor', root: file, edit: true },
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
    const tab = { id: '1', tool: 'diff', compare } as const;
    await store.update(tabsKey, [
      tab,
      { id: '2', tool: 'diff', compare: { old: 'a' } },
      { id: '3', tool: 'diff', compare: 'a' },
    ]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [tab]);

    const written = new FakeStore();
    await storageOf(written).setLayout([{ id: '1', tabs: [tab], active: '1' }]);
    assert.deepStrictEqual(written.get(tabsKey), [tab]);
  });

  test('keeps a tab that compares versions of files as one, read and written, the version of each side and the file whose history it is with it, dropping a version not of two strings', async () => {
    const store = new FakeStore();
    const file = path.resolve('notes.txt');
    const compare = {
      old: file,
      new: file,
      oldVersion: { rev: 'a'.repeat(40), file },
      newVersion: { rev: 'index', file },
    };
    const tab = { id: '1', tool: 'diff', compare } as const;
    await store.update(tabsKey, [
      tab,
      {
        id: '2',
        tool: 'diff',
        compare: { ...compare, oldVersion: { rev: 'HEAD' } },
      },
    ]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [tab]);

    const written = new FakeStore();
    await storageOf(written).setLayout([{ id: '1', tabs: [tab], active: '1' }]);
    assert.deepStrictEqual(written.get(tabsKey), [tab]);
  });

  test('keeps a tab that views a version of a file as one, read and written, the file whose history it is with it, dropping a version not of two strings', async () => {
    const store = new FakeStore();
    const version = {
      rev: '0123456789abcdef0123456789abcdef01234567',
      file: path.resolve('src', 'new.ts'),
    };
    const tab = {
      id: '1',
      tool: 'viewer',
      root: path.resolve('lib', 'old.ts'),
      version,
    } as const;
    await store.update(tabsKey, [
      tab,
      { ...tab, id: '2', version: { rev: version.rev } },
      { ...tab, id: '3', version: 'HEAD' },
    ]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [tab]);

    const written = new FakeStore();
    await storageOf(written).setLayout([{ id: '1', tabs: [tab], active: '1' }]);
    assert.deepStrictEqual(written.get(tabsKey), [tab]);
  });

  test('reads a tab of git that compared two files, saved before the diff was a tool of its own, as a tab of the diff with the same id, leaving the tabs of repositories to git', async () => {
    const store = new FakeStore();
    const compare = {
      old: path.resolve('old.txt'),
      new: path.resolve('new.txt'),
    };
    const repository = {
      id: '2',
      tool: 'git',
      root: path.resolve('r'),
    } as const;
    await store.update(tabsKey, [
      { id: '1', tool: 'git', compare },
      repository,
      { id: '3', tool: 'git', compare: 'a' },
    ]);
    assert.deepStrictEqual(storageOf(store).savedTabs, [
      { id: '1', tool: 'diff', compare },
      repository,
    ]);
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
