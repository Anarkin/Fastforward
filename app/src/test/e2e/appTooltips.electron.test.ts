import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { closeOrKill, launchApp } from './appLaunch';
import { writeSettings } from './settingsWritten';
import { onceDrawn } from './waits';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { waitFor } from '../helpers/fixtures';
import { seenRows } from './cellsSeen';

const editorRows = (page: Page): Promise<readonly SeenRow[]> =>
  page.evaluate(() => {
    const host = document.querySelector('.editor-cells');
    return host instanceof HTMLElement && host.querySelector('canvas') !== null
      ? (host.seenRows?.() ?? [])
      : [];
  });
import type { SeenRow } from '../../components/cells/page/seen';

const atOnce = { tooltips: { delayMilliseconds: 0 } };

const never = { tooltips: { delayMilliseconds: 10_000 } };

const charactersAtOnce = {
  tooltips: { delayMilliseconds: 10_000, characterDelayMilliseconds: 0 },
};

suite('App tooltips', () => {
  let folder: string;
  let profile: string;
  let viewed: string;
  let app: ElectronApplication;
  let page: Page;

  const tooltip = () => page.locator('.card.tip');
  const flat = () =>
    page.locator(`button[data-tip="${strings.commander.flatView}"]`).first();
  const away = () => page.mouse.move(400, 400);

  beforeAll(async () => {
    folder = tempFolder('tooltips');
    profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(profile);
    fs.mkdirSync(opened);
    viewed = path.join(opened, 'viewed.txt');
    fs.writeFileSync(viewed, 'te​xt');
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: opened },
          { id: '2', tool: 'viewer', root: viewed },
          { id: '3', tool: 'editor', root: viewed },
        ],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify(atOnce),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.commander-pane').first().waitFor();
  });

  afterAll(async () => {
    await closeOrKill(app);
    removeFolder(folder);
  });

  test('shows the tooltip of a button the pointer rests on as a card of the app, its words and the keys that do the same as a key cap after them, centered below the button, inside the window and on whole device pixels, the browser showing none of its own', async () => {
    await away();
    await flat().hover();
    await tooltip().waitFor();
    assert.deepStrictEqual(
      [
        await tooltip().locator('.card-message').textContent(),
        await tooltip().locator('.shortcut-combo kbd').allTextContents(),
      ],
      [strings.commander.flatView, ['Ctrl', 'B']],
    );
    const placed = await page.evaluate((selector) => {
      const card = document.querySelector('.card.tip');
      const button = document.querySelector(selector);
      if (card === null || button === null) {
        return undefined;
      }
      const tip = card.getBoundingClientRect();
      const under = button.getBoundingClientRect();
      const ratio = window.devicePixelRatio;
      return {
        centered:
          Math.abs(tip.left + tip.width / 2 - (under.left + under.width / 2)) <=
          1,
        below: tip.top >= under.bottom,
        near: tip.top - under.bottom <= 8,
        inside:
          tip.left >= 0 &&
          tip.right <= window.innerWidth &&
          tip.bottom <= window.innerHeight,
        sharp: [tip.left, tip.top].every(
          (edge) => Math.abs(edge * ratio - Math.round(edge * ratio)) < 0.01,
        ),
        seen: getComputedStyle(card).visibility,
        untouchable: getComputedStyle(card).pointerEvents,
        titled: document.querySelectorAll('[title]').length,
      };
    }, `button[data-tip="${strings.commander.flatView}"]`);
    assert.deepStrictEqual(placed, {
      centered: true,
      below: true,
      near: true,
      inside: true,
      sharp: true,
      seen: 'visible',
      untouchable: 'none',
      titled: 0,
    });
  });

  test('hides the tooltip once the pointer leaves its button, and at a press, staying hidden over the button pressed until the pointer has left it', async () => {
    await away();
    await flat().hover();
    await tooltip().waitFor();
    await away();
    await tooltip().waitFor({ state: 'detached' });
    await flat().hover();
    await tooltip().waitFor();
    await page.mouse.down();
    await tooltip().waitFor({ state: 'detached' });
    await page.mouse.up();
    await onceDrawn(page);
    await onceDrawn(page);
    assert.strictEqual(await tooltip().count(), 0);
    await away();
    await flat().hover();
    await tooltip().waitFor();
    await flat().click();
    await tooltip().waitFor({ state: 'detached' });
    await away();
  });

  test('names the file of a tab in the tooltip of the tab as every path is drawn, its folders and its name the parts of a path, starting where the tab starts', async () => {
    await away();
    const tab = page.locator('.tabs .tab').nth(1);
    await tab.hover();
    await tooltip().waitFor();
    assert.strictEqual(await tooltip().textContent(), viewed);
    assert.ok((await tooltip().locator('.named-path .path-part').count()) > 1);
    const starts = await page.evaluate(() => {
      const card = document.querySelector('.card.tip');
      const under = document.querySelectorAll('.tabs .tab')[1];
      return card && under
        ? Math.abs(
            card.getBoundingClientRect().left -
              under.getBoundingClientRect().left,
          )
        : undefined;
    });
    assert.ok(starts !== undefined && starts <= 1, String(starts));
  });

  test('waits as long as the settings say before it shows a tooltip, showing none for a pointer resting a moment where they say ten seconds, and one at once where they say none', async () => {
    await away();
    await writeSettings(page, profile, never);
    await page.locator('.commander-pane').first().waitFor();
    await flat().hover();
    await onceDrawn(page);
    await onceDrawn(page);
    assert.strictEqual(await tooltip().count(), 0);
    await away();
    await writeSettings(page, profile, atOnce);
    await page.locator('.commander-pane').first().waitFor();
    await flat().hover();
    await tooltip().waitFor();
  });

  test('names a character drawn as a sign in a text by its code point and its name in a tooltip over its cell, in the viewer and the editor alike, as soon as the pointer is on it where the settings say so, while the buttons still wait as long as they say', async () => {
    await away();
    await writeSettings(page, profile, charactersAtOnce);
    for (const [tab, rows] of [
      [1, seenRows],
      [2, editorRows],
    ] as const) {
      await page.locator('.tabs .tab').nth(tab).click();
      let row: SeenRow | undefined;
      await waitFor(async () => {
        [row] = await rows(page);
        return row?.text === 'te​xt';
      }, `the text of tab ${tab}`);
      assert.ok(row);
      await page.mouse.move(
        row.left + (2 - row.column + 0.5) * row.advance,
        row.top + row.height / 2,
      );
      await tooltip().waitFor();
      assert.strictEqual(
        await tooltip().locator('.card-message').textContent(),
        'U+200B ZERO WIDTH SPACE',
        `tab ${tab}`,
      );
      await page.mouse.move(
        row.left + (0 - row.column + 0.5) * row.advance,
        row.top + row.height / 2,
      );
      await tooltip().waitFor({ state: 'detached' });
      await away();
    }
    await page.locator('.tabs .tab').nth(0).click();
    await writeSettings(page, profile, atOnce);
    await page.locator('.commander-pane').first().waitFor();
  });
});
