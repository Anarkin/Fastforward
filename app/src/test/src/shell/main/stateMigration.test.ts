import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { UserSettings } from '../../../../shell/main/userSettings';
import { JsonFileStore } from '../../../../shell/main/stateFile';
import { migratedState } from '../../../../shell/main/stateMigration';
import { Storage } from '../../../../shell/main/storage';
import { defaultSettings } from '../../../helpers/fixtures';
import { removeFolder, tempFolder } from '../../../helpers/tempFolders';

suite('State of version 22', () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = tempFolder('state');
    file = path.join(folder, 'state.json');
  });

  afterEach(() => removeFolder(folder));

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
});
