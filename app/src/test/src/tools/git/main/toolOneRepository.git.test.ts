import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  activeTabKey,
  tabsKey,
  windowsKey,
} from '../../../../../shell/main/storage';
import { JsonFileStore } from '../../../../../shell/main/stateFile';
import { GitStorage, recentKey } from '../../../../../tools/git/main/storage';
import { FakeStore } from '../../../../helpers/fakeStore';
import { waitFor } from '../../../../helpers/fixtures';
import {
  installedGit,
  type TempRepository,
} from '../../../../helpers/repositories';
import {
  recordingLog,
  failOnErrorsLogged,
  takeErrorsLogged,
} from '../../../../helpers/stub';
import {
  gitState,
  attach,
  newView,
  saveTabs,
  closeViews,
  gate,
  openView,
  savedBookmarks,
  settingsForViews,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Git tool of one repository', () => {
  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, fixture } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows a tab without waiting for the state to be written', async () => {
    const written = gate();
    const state = new FakeStore();
    await saveTabs(state, [repository.root]);
    state.update = (key, value) => {
      state.values.set(key, value);
      return written.opened;
    };
    const view = newView(log, await installedGit(), settingsForViews(), state);
    const opened = attach(view);
    try {
      const ready = opened.connection.receive({ type: 'ready' });
      await waitFor(
        () => opened.page.last('commits') !== undefined,
        'the history',
      );
      assert.deepStrictEqual(state.get(windowsKey), [
        { id: '1', tabs: ['1'], active: '1' },
      ]);
      assert.deepStrictEqual(gitState(state).get(recentKey), [repository.root]);
      written.open();
      await ready;
    } finally {
      opened.connection.dispose();
    }
  });

  test('keeps the saved tabs when the state could not be read at start but can be by the next change saved', async () => {
    const profile = tempFolder('state');
    const file = path.join(profile, 'state.json');
    fs.mkdirSync(file);
    const store = new JsonFileStore(file);
    const view = newView(log, await installedGit(), settingsForViews(), store);
    const opened = attach(view);
    try {
      await opened.connection.receive({ type: 'ready' });
      fs.rmdirSync(file);
      fs.writeFileSync(
        file,
        JSON.stringify({
          [tabsKey]: [{ id: '1', tool: 'git', root: repository.root }],
          [activeTabKey]: '1',
        }),
      );
      await store.update('windowBounds', { x: 0, y: 0 });
      assert.deepStrictEqual(new JsonFileStore(file).get(tabsKey), [
        { id: '1', tool: 'git', root: repository.root },
      ]);
      assert.strictEqual(new JsonFileStore(file).get(activeTabKey), '1');
    } finally {
      opened.connection.dispose();
      removeFolder(profile);
    }
  });

  test('applies the settings the page changes though they fail to be written', async () => {
    const rounds: (() => void)[] = [];
    const own = await openView(
      log,
      [repository.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    const setIn = own.settings.setIn.bind(own.settings);
    own.settings.setIn = (section, key, value) => {
      void setIn(section, key, value);
      return Promise.reject(new Error('settings not written'));
    };
    try {
      await own.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      await own.connection.receive({
        type: 'setCollapseMerges',
        collapse: false,
      });
      assert.strictEqual(own.page.last('commits')?.total, 5);
      own.page.clear();
      await own.connection.receive({
        type: 'setIgnoreWhitespace',
        ignore: true,
      });
      assert.strictEqual(own.page.last('diff')?.hash, fixture.merge);
      await own.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 1, 'a background round');
      assert.strictEqual(own.page.last('error'), undefined);
      takeErrorsLogged(
        logged,
        /^Saving the state failed$/,
        /^settings not written$/,
      );
    } finally {
      own.connection.dispose();
    }
  });

  test('keeps the layout and bookmarks the page changes though they fail to be written, saying so only in the log', async () => {
    const own = await openView(log, [repository.root]);
    const setIn = own.settings.setIn.bind(own.settings);
    own.settings.setIn = (section, key, value) => {
      void setIn(section, key, value);
      return Promise.reject(new Error('settings not written'));
    };
    own.store.update = (key, value) => {
      own.store.values.set(key, value);
      return Promise.reject(new Error('state not written'));
    };
    try {
      await own.connection.receive({
        type: 'setColumnWidths',
        widths: [300, 400],
      });
      await own.connection.receive({ type: 'setShowAllFiles', show: true });
      await own.connection.receive({
        type: 'setDiffLayout',
        layout: 'sideBySide',
      });
      await own.connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      assert.strictEqual(own.page.last('error'), undefined);
      const { layout } = new GitStorage(own.settings, gitState(own.store))
        .preferences;
      assert.deepStrictEqual(
        [layout.columnWidths, layout.showAllFiles, layout.diffLayout],
        [[300, 400], true, 'sideBySide'],
      );
      assert.deepStrictEqual(savedBookmarks(own.store, repository.root), []);
      takeErrorsLogged(
        logged,
        /^Saving the state failed$/,
        /^settings not written$/,
        /^state not written$/,
      );
    } finally {
      own.connection.dispose();
    }
  });

  test('shows the bookmarks made for a repository opened for the first time though they fail to be written', async () => {
    const own = await openView(log, [repository.root], false);
    own.store.update = (key, value) => {
      own.store.values.set(key, value);
      return Promise.reject(new Error('state not written'));
    };
    try {
      await own.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(own.page.last('bookmarks')?.bookmarks, [
        { kind: 'branch', name: 'main' },
      ]);
      assert.strictEqual(own.page.last('error'), undefined);
      takeErrorsLogged(
        logged,
        /^Saving the state failed$/,
        /^state not written$/,
      );
    } finally {
      own.connection.dispose();
    }
  });
});
