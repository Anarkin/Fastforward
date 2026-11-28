import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { inFront, systemClipboard, systemDoubleClick } from './systemInput';
import { untilSettled } from './waits';

suite('App canvas clipboard', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  const seenBoard = () =>
    page
      .locator('.board-host')
      .evaluate((element: HTMLElement) => element.seenBoard?.());

  const pointAt = async (cell: { column: number; row: number }) => {
    const seen = await seenBoard();
    const box = await page.locator('.board-host').boundingBox();
    const ratio = await page.evaluate(() => devicePixelRatio);
    assert.ok(seen !== undefined && box !== null);
    return {
      x:
        box.x +
        (cell.column - seen.origin.column + 0.5) * (seen.advance / ratio),
      y: box.y + (cell.row - seen.origin.row + 0.5) * (seen.rowHeight / ratio),
    };
  };

  const holds = (what: string, text: string, wanted = true) =>
    untilSettled(
      async () => (await seenBoard())?.rows.some((row) => row.includes(text)),
      what,
      { accepted: (seen) => seen === wanted },
    );

  const copied = (what: string, wanted: string) =>
    untilSettled(
      () => app.evaluate(({ clipboard }) => clipboard.readText()),
      what,
      { accepted: (text) => text === wanted },
    );

  beforeAll(async () => {
    folder = tempFolder('app-canvas-clipboard');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile);
    const board = path.join(folder, 'words.canvas');
    fs.writeFileSync(
      board,
      JSON.stringify({
        nodes: [
          {
            id: 'words',
            type: 'text',
            text: 'Idea here',
            x: 0,
            y: 0,
            width: 280,
            height: 90,
          },
        ],
        edges: [],
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'canvas', root: board }],
        activeTab: '1',
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

  test('copies, pastes and cuts in a text node double-clicked by the presses and keys the system sends, the page having no caret of its own, as the browser gives none to an element that starts taking text while it has the focus and fires the clipboard of one without a caret at the body, where the presses and keys of Playwright give the page the focus anew each, and a caret with it', async () => {
    await page.locator('.board-host canvas').first().waitFor();
    await holds('the canvas drawn', 'Idea here');
    await inFront(app, page);
    await systemDoubleClick(app, page, await pointAt({ column: 3, row: 1 }));
    await untilSettled(() => page.locator('.board-cursor').count(), 'typing', {
      accepted: (count) => count === 1,
    });
    assert.strictEqual(await page.evaluate(() => getSelection()?.type), 'None');
    await app.evaluate(({ clipboard }) => clipboard.writeText('nothing yet'));
    await systemClipboard(app, page, 'copy');
    await copied('the word selected copied', 'Idea');
    await app.evaluate(({ clipboard }) => clipboard.writeText('Plan'));
    await systemClipboard(app, page, 'paste');
    await holds('the word pasted over the one selected', 'Plan here');
    await systemDoubleClick(app, page, await pointAt({ column: 8, row: 1 }));
    await systemClipboard(app, page, 'cut');
    await copied('the word selected cut', 'here');
    await holds('the word cut gone', 'Plan here', false);
    assert.strictEqual(await page.evaluate(() => getSelection()?.type), 'None');
  });
});
