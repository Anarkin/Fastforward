import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import {
  comesBackFromEach,
  scrolledAround,
  settledLooks,
  showTab,
  tabs,
} from './tabReturns';

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
    fs.writeFileSync(path.join(opened, 'other.txt'), lines(200, String));
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: opened },
          {
            id: '2',
            tool: 'editor',
            root: path.join(opened, 'edited.txt'),
          },
          { id: '3', tool: 'terminal', root: opened },
          {
            id: '4',
            tool: 'editor',
            root: path.join(opened, 'other.txt'),
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
  const throughEveryOther = (what: string) =>
    comesBackFromEach(
      page,
      [commanderTab, terminalTab, otherTab],
      (away) => `${what} left for tab ${away}`,
    );

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

  test('brings back a file edited scrolled to its middle while its find is open, at the same line and the same pixel of it, from every other tab', async () => {
    await showTab(page, editorTab);
    await page.locator('.editor .cm-line').first().click();
    await page.keyboard.press('ControlOrMeta+F');
    await page.keyboard.type('adam');
    await page
      .locator('.editor .search-bar:has(:focus) .search-toggle')
      .first()
      .click();
    await scrolledAround(page);
    await throughEveryOther('The editor scrolled while finding');
  });

  test('keeps the cursor and the place of a file with no changes here once it is read again for a change on disk made while its tab was away', async () => {
    await showTab(page, otherTab);
    await page.locator('.editor .cm-line').nth(5).click();
    await page.keyboard.press('End');
    const cursorLine = () =>
      page.evaluate(
        () =>
          document.getSelection()?.focusNode?.parentElement?.closest('.cm-line')
            ?.textContent,
      );
    assert.strictEqual(await cursorLine(), '5');
    await page
      .locator('.editor .cm-scroller')
      .evaluate((scroller) => scroller.scrollTo({ top: 400 }));
    const left = await settledLooks(page);
    await showTab(page, commanderTab);
    await settledLooks(page);
    const listed = () =>
      page
        .locator('.commander-pane .commander-line', { hasText: 'other' })
        .first()
        .textContent();
    const before = await listed();
    fs.appendFileSync(
      path.join(folder, 'opened', 'other.txt'),
      `${String.fromCharCode(10)}added`,
    );
    await waitFor(
      async () => (await listed()) !== before,
      'the main process to see the file change, as the commander lists it anew',
    );
    await showTab(page, otherTab);
    assert.deepStrictEqual(await settledLooks(page), left);
    assert.strictEqual(await cursorLine(), '5');
    await page
      .locator('.editor .cm-scroller')
      .evaluate((scroller) =>
        scroller.scrollTo({ top: scroller.scrollHeight }),
      );
    await waitFor(
      async () =>
        (
          await page
            .locator('.editor .cm-line')
            .evaluateAll((all) => all.map((line) => line.textContent))
        ).includes('added'),
      'the text read again',
    ).catch(async (error: unknown) => {
      throw new Error(
        `${String(error)}: ${JSON.stringify(
          await page
            .locator('.editor .cm-line')
            .evaluateAll((all) =>
              all.slice(-3).map((line) => line.textContent),
            ),
        )} ${await cursorLine()}`,
      );
    });
  });

  test('keeps the place scrolled to of a file shown while it is read again for a change on disk, though its cursor is out of view, rather than scrolling to the cursor', async () => {
    const scroller = page.locator('.editor .cm-scroller');
    await scroller.evaluate((element) => element.scrollTo({ top: 400 }));
    const left = await settledLooks(page);
    const tall = await scroller.evaluate((element) => element.scrollHeight);
    fs.appendFileSync(
      path.join(folder, 'opened', 'other.txt'),
      `${String.fromCharCode(10)}more`,
    );
    await waitFor(
      async () =>
        (await scroller.evaluate((element) => element.scrollHeight)) > tall,
      'the text read again, a line longer',
    );
    assert.deepStrictEqual(await settledLooks(page), left);
  });
});
