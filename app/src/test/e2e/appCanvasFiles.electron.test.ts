import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { showTab } from './tabReturns';
import { untilSettled } from './waits';

suite('App canvas files', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  const seenBoard = () =>
    page
      .locator('.board-host')
      .evaluate((element: HTMLElement) => element.seenBoard?.());

  const kindsOf = async (words: string) =>
    (await seenBoard())?.pieces
      .find(({ kinds }) => kinds.map(([text]) => text).join('') === words)
      ?.kinds.map(([, kind]) => kind)
      .filter((kind) => kind !== '');

  beforeAll(async () => {
    folder = tempFolder('app-canvas-files');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile);
    const board = path.join(folder, 'notes.canvas');
    fs.writeFileSync(
      board,
      JSON.stringify({
        nodes: [
          {
            id: 'marked',
            type: 'text',
            text: 'plain words\n# Heading',
            x: 0,
            y: 0,
            width: 210,
            height: 72,
          },
        ],
        edges: [],
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: folder },
          { id: '2', tool: 'canvas', root: board },
        ],
        activeTab: '2',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('colors the text of a text node as Markdown, as the viewer colors a Markdown file, a heading in the colors of the theme and plain words in none', async () => {
    await page.locator('.board-host canvas').first().waitFor();
    await untilSettled(
      async () => JSON.stringify(await kindsOf('# Heading')),
      'the heading colored',
      { accepted: (kinds) => kinds !== undefined && kinds !== '[]' },
    );
    assert.deepStrictEqual(await kindsOf('plain words'), []);
  });

  test('makes a new canvas named on Shift+F4 in the commander, empty in a canvas tab of its own, writing its file once it is saved', async () => {
    const fresh = path.join(folder, 'fresh.canvas');
    await showTab(page, 0);
    await page.locator('.commander-pane').last().click();
    await page.keyboard.press('Shift+F4');
    const prompt = page.locator('.prompt-input');
    await prompt.waitFor();
    await prompt.fill('fresh.canvas');
    await prompt.press('Enter');
    await page
      .locator('.tabs .tab.active .tab-name', { hasText: 'fresh.canvas' })
      .waitFor();
    await page.locator('.board-host canvas').first().waitFor();
    assert.strictEqual(fs.existsSync(fresh), false);
    await page.keyboard.press('ControlOrMeta+S');
    await untilSettled(
      () => Promise.resolve(fs.existsSync(fresh)),
      'the new canvas written',
      { accepted: (written) => written },
    );
    assert.strictEqual(fs.readFileSync(fresh, 'utf8'), '{}');
  });
});
