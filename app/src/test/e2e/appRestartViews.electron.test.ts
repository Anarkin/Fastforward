import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { showTab } from './tabReturns';

const names = Array.from({ length: 40 }, (_, line) =>
  line % 4 === 1 ? `NAME_${line}=adam` : `NAME_${line}=eve`,
).join('\n');

const viewerCount = (page: Page) =>
  page.locator('.viewer .search-count').textContent({ timeout: 1000 });

const findText = (page: Page, tool: 'viewer' | 'editor') =>
  page.locator(`.${tool} .search-box-input`).inputValue({ timeout: 1000 });

suite('App started again', () => {
  test('brings back the find of a viewer tab and of an editor tab, their query and the match the viewer was on, once the app starts again, as the view of each tab is saved with it', async () => {
    const folder = tempFolder('app-restart-views');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(profile, { recursive: true });
    fs.mkdirSync(opened, { recursive: true });
    const viewed = path.join(opened, 'viewed.txt');
    const edited = path.join(opened, 'edited.txt');
    fs.writeFileSync(viewed, names);
    fs.writeFileSync(edited, names);
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'viewer', root: viewed },
          { id: '2', tool: 'editor', root: edited },
        ],
        activeTab: '1',
      }),
    );
    let app: ElectronApplication | undefined = await launchApp(profile);
    try {
      let page = await app.firstWindow();
      await page.locator('.viewer-rows .viewer-row').first().click();
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('adam');
      await waitFor(
        async () => (await viewerCount(page)) === '1 of 10',
        'the viewer find',
      );
      await page.keyboard.press('Enter');
      await waitFor(
        async () => (await viewerCount(page)) === '2 of 10',
        'the second match',
      );
      await showTab(page, 1);
      await page.locator('.editor .cm-content').click();
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('eve');
      await waitFor(
        async () => (await findText(page, 'editor')) === 'eve',
        'the editor find',
      );
      await showTab(page, 0);
      await closeOrKill(app);
      app = undefined;

      app = await launchApp(profile);
      page = await app.firstWindow();
      await waitFor(
        async () => (await viewerCount(page).catch(() => null)) === '2 of 10',
        'the viewer find back on its second match',
      );
      assert.strictEqual(await findText(page, 'viewer'), 'adam');
      await showTab(page, 1);
      await waitFor(
        async () => (await findText(page, 'editor').catch(() => '')) === 'eve',
        'the editor find back',
      );
    } finally {
      if (app !== undefined) {
        await closeOrKill(app);
      }
      removeFolder(folder);
    }
  });
});
