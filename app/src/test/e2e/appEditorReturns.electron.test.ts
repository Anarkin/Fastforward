import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { comesBackAsLeft, settledLooks, showTab, tabs } from './tabReturns';

const lines = (count: number, line: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => line(index)).join(
    String.fromCharCode(10),
  );

const editedText = lines(300, (index) =>
  index % 30 === 11 ? `${index} adam ${'wide '.repeat(60)}` : `${index} line`,
);

const commanderTab = 0;
const editorTab = 1;
const terminalTab = 2;
const otherTab = 3;

suite('App editor tabs shown again', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-editor-returns');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.writeFileSync(path.join(opened, 'edited.txt'), editedText);
    fs.writeFileSync(path.join(opened, 'other.txt'), lines(40, String));
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: opened },
          {
            id: '2',
            tool: 'commander',
            root: path.join(opened, 'edited.txt'),
            edit: true,
          },
          { id: '3', tool: 'terminal', root: opened },
          {
            id: '4',
            tool: 'commander',
            root: path.join(opened, 'other.txt'),
            edit: true,
          },
        ],
        activeTab: '2',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await waitFor(async () => (await tabs(page).count()) === 4, 'every tab');
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  const count = () =>
    page.locator('.editor .search-count').textContent({ timeout: 1000 });
  const throughEveryOther = async (what: string) => {
    for (const away of [commanderTab, terminalTab, otherTab]) {
      await comesBackAsLeft(page, away, `${what} left for tab ${away}`);
    }
  };

  test('brings back a file edited with its find and replace open, their text, the match it was at and the caret in the box it was in, from a commander tab, the tab of another tool and the editor of another file, which shows nothing of them', async () => {
    await showTab(page, editorTab);
    await page.locator('.editor .cm-line').first().click();
    await page.keyboard.press('ControlOrMeta+F');
    await page.keyboard.type('adam');
    await waitFor(async () => (await count()) === '1 of 10', 'the count');
    await page.keyboard.press('Enter');
    await waitFor(async () => (await count()) === '2 of 10', 'the next');
    await page.keyboard.press('ArrowLeft');
    await throughEveryOther('The editor finding');

    await page.keyboard.press('Control+H');
    await page.locator('.editor-replace-input').fill('eve');
    await page.keyboard.press('ArrowLeft');
    await throughEveryOther('The editor replacing');
    assert.strictEqual(await count(), '2 of 10');

    await showTab(page, otherTab);
    await settledLooks(page);
    assert.strictEqual(await page.locator('.editor .search-box').count(), 0);
    assert.strictEqual(await page.locator('.editor .find-match').count(), 0);

    await showTab(page, editorTab);
    await page.locator('.editor .search-box-input').focus();
    await page.keyboard.press('Escape');
    await page.locator('.editor .search-box').waitFor({ state: 'detached' });
    await throughEveryOther('The editor once its find closed');
    assert.strictEqual(await page.locator('.editor .find-match').count(), 0);
  });

  test('brings back a file edited scrolled down and sideways, with the cursor where it was, from every other tab', async () => {
    await showTab(page, editorTab);
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page
      .getByRole('button', { name: 'Wrap Long Lines', pressed: false })
      .waitFor();
    await page
      .locator('.editor .cm-scroller')
      .evaluate((scroller) => scroller.scrollTo({ top: 3133, left: 213 }));
    await throughEveryOther('The editor scrolled');
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page
      .getByRole('button', { name: 'Wrap Long Lines', pressed: true })
      .waitFor();
  });

  test('brings back a file edited with its long lines wrapped, scrolled into the middle of a wrapped row, from every other tab', async () => {
    await showTab(page, editorTab);
    const wrappedRow = () =>
      page.locator('.editor .cm-scroller').evaluate((scroller) => {
        const heights = [...scroller.querySelectorAll('.cm-line')].map(
          (line) => line.getBoundingClientRect().height,
        );
        const row = Math.min(...heights);
        const index = heights.findIndex((height) => height > row * 1.5);
        const line = scroller.querySelectorAll('.cm-line')[index];
        return line === undefined
          ? undefined
          : {
              row,
              top:
                line.getBoundingClientRect().top -
                scroller.getBoundingClientRect().top +
                scroller.scrollTop,
            };
      });
    await waitFor(
      async () => (await wrappedRow()) !== undefined,
      'the long lines wrapped',
    ).catch(async (error: unknown) => {
      throw new Error(
        `${String(error)}: ${JSON.stringify(
          await page
            .locator('.editor .cm-scroller')
            .evaluate((scroller) =>
              [...scroller.querySelectorAll('.cm-line')].map((line) => [
                line.getBoundingClientRect().height,
                line.textContent?.length,
              ]),
            ),
        )}`,
      );
    });
    const wrapped = await wrappedRow();
    assert.ok(wrapped);
    await page
      .locator('.editor .cm-scroller')
      .evaluate(
        (scroller, { top, row }) => scroller.scrollTo({ top: top + row * 1.5 }),
        wrapped,
      );
    await throughEveryOther('The editor scrolled into a wrapped row');
  });
});
