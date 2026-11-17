import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { ElectronApplication } from 'playwright-core';
import { afterEach, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';

suite('Closing the app a test started', () => {
  let folder: string | undefined;
  let app: ElectronApplication | undefined;
  let running: ChildProcess | undefined;

  afterEach(async () => {
    if (app !== undefined && running?.exitCode === null) {
      await closeOrKill(app);
    }
    app = undefined;
    running = undefined;
    if (folder !== undefined) {
      removeFolder(folder);
      folder = undefined;
    }
  });

  const launched = async (tab: (opened: string) => object) => {
    const made = tempFolder('app-launch');
    folder = made;
    const profile = path.join(made, 'profile');
    const opened = path.join(made, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(opened, 'edited.txt'), 'as it was\n');
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', ...tab(opened) }],
        activeTab: '1',
      }),
    );
    const started = await launchApp(profile);
    app = started;
    running = started.process();
    return {
      started,
      opened,
      quit: started.process(),
      page: await started.firstWindow(),
    };
  };

  test('lets an app that asks before it quits, as with a terminal tab open, quit by answering it, rather than waiting ten seconds for an answer and killing it', async () => {
    const { started, quit, page } = await launched((opened) => ({
      tool: 'terminal',
      root: opened,
    }));
    await page.locator('.terminal-screen').waitFor();
    await closeOrKill(started);
    assert.strictEqual(quit.exitCode, 0);
  });

  test('lets an app with unsaved changes quit without saving them, leaving the file as it was', async () => {
    const { started, opened, quit, page } = await launched((folderOpened) => ({
      tool: 'editor',
      root: path.join(folderOpened, 'edited.txt'),
    }));
    await page.locator('.editor .cm-content').click();
    await page.keyboard.type('changed ');
    await page.locator('nav.tabs .tab-unsaved').waitFor();
    await closeOrKill(started);
    assert.strictEqual(quit.exitCode, 0);
    assert.strictEqual(
      fs.readFileSync(path.join(opened, 'edited.txt'), 'utf8'),
      'as it was\n',
    );
  });
});
