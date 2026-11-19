import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JSHandle } from 'playwright-core';
import { suite, test } from 'vitest';
import {
  openChangedFile,
  page,
  repository,
  savedSetting,
  sharedApp,
} from './appFixtures';
import { waitForCount, waitForFocus } from './waits';
import { drawnCodeRow } from './wrappingFixtures';
import { longLines } from './wrappingSamples';
import { waitFor } from '../helpers/fixtures';
import { assertFillsRows } from './markRows';

const commented = (answer: number) =>
  `/* the answer\na\nb\nc\n*/\nexport const answer = ${answer};\n`;

suite('App', () => {
  sharedApp({
    'code.ts': 'export const answer = 42;\n',
    'commented.ts': commented(42),
    'long.txt': `${longLines.join('\n')}\n`,
  });

  test('colors code away from the page, offers every language for a file selected from a button in line with the others, opening rightwards from the button, as it starts the toolbar, marking what its filter found as tall as the item it is on, but only Auto and Plain Text for many, leaves code plain on Plain Text until Auto, and colors a file in a language chosen for it until another is selected', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'code.ts' }).click();
    await page.locator('.syntax-keyword', { hasText: 'export' }).waitFor();
    await page.locator('.syntax-number', { hasText: '42' }).waitFor();
    const button = page.locator('.diff-options .language-button');
    const label = () => button.locator('.menu-button-label').textContent();
    const keyword = page.locator('.diff-line .syntax-keyword').first();
    const choose = async (item: string, typed?: string) => {
      await button.locator('.menu-button-trigger').click();
      if (typed !== undefined) {
        await page.keyboard.type(typed);
      }
      await button
        .locator('.menu-item', { hasText: new RegExp(`^${item}$`) })
        .click();
      await button.locator('.menu').waitFor({ state: 'detached' });
    };
    assert.strictEqual(await label(), 'TypeScript');
    const middles = await Promise.all(
      [
        button.locator('.menu-button-trigger'),
        page.locator('.diff-options [data-tip="Show Whitespace"]'),
      ].map(async (each) => {
        const box = await each.boundingBox();
        return box && box.y + box.height / 2;
      }),
    );
    assert.strictEqual(middles[0], middles[1]);
    await page.keyboard.press('l');
    await button.locator('.search-box-input').waitFor();
    assert.ok((await button.locator('.menu-item').count()) > 200);
    const [menuBox, buttonBox] = await Promise.all([
      button.locator('.menu').boundingBox(),
      button.locator('.menu-button').boundingBox(),
    ]);
    assert.strictEqual(menuBox?.x, buttonBox?.x);
    await page.keyboard.type('typescript');
    const found = button.locator('.menu-item .match').first();
    await found.waitFor();
    await assertFillsRows(found, '.menu-item');
    await page.keyboard.press('Escape');
    await button.locator('.menu').waitFor({ state: 'detached' });

    await choose('Plain Text');
    await keyword.waitFor({ state: 'detached' });
    assert.strictEqual(await label(), 'Plain Text');
    await choose('TypeScript', 'typescript');
    await keyword.waitFor();
    assert.strictEqual(await label(), 'TypeScript');

    await page.locator('.row.group', { hasText: 'All Changes' }).click();
    await page
      .locator('.row.group.selected', { hasText: 'All Changes' })
      .waitFor();
    assert.strictEqual(await label(), 'Plain Text');
    await keyword.waitFor({ state: 'detached' });
    await button.locator('.menu-button-trigger').click();
    assert.deepStrictEqual(
      await button.locator('.menu-item').allTextContents(),
      ['Auto', '✓Plain Text'],
    );
    assert.strictEqual(await button.locator('.search-box-input').count(), 0);
    await button.locator('.menu-item', { hasText: /^Auto$/ }).click();
    await keyword.waitFor();
    assert.strictEqual(await label(), 'Auto');
    await page.locator('.row.file', { hasText: 'code.ts' }).click();
    await waitFor(async () => (await label()) === 'TypeScript', 'the language');
  });

  test('keeps the lines of a diff colored as the whole text of their side has it while the working tree changes under it', async () => {
    const file = path.join(repository.root, 'commented.ts');
    fs.writeFileSync(file, commented(43));
    let watching:
      JSHandle<{ uncolored: string[]; stop: () => void }> | undefined;
    try {
      await page.locator('.row.file', { hasText: 'commented.ts' }).click();
      await page
        .locator('.diff-line .syntax-comment', { hasText: '*/' })
        .first()
        .waitFor();
      watching = await page.evaluateHandle(() => {
        const expected = new Map([
          ['b', 'syntax-comment'],
          ['c', 'syntax-comment'],
          ['*/', 'syntax-comment'],
          ['export const answer = 42;', 'syntax-keyword'],
        ]);
        const uncolored: string[] = [];
        const observer = new MutationObserver(() => {
          for (const code of document.querySelectorAll('.diff-line .code')) {
            const text = code.textContent ?? '';
            const kind = expected.get(text);
            if (kind !== undefined && !code.querySelector(`.${kind}`)) {
              uncolored.push(text);
            }
          }
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        return { uncolored, stop: () => observer.disconnect() };
      });
      for (const answer of [44, 45, 46]) {
        fs.writeFileSync(file, commented(answer));
        await page
          .locator('.diff-line .syntax-number', { hasText: String(answer) })
          .first()
          .waitFor();
      }
      assert.deepStrictEqual(
        await watching.evaluate(({ uncolored }) => uncolored),
        [],
      );
    } finally {
      await watching?.evaluate(({ stop }) => stop());
      await repository.git('checkout', '-q', 'HEAD', '--', 'commented.ts');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
  });

  test('finds in the diff on Ctrl+F in the diff, marking a match on the very rows of device pixels of its line, stepping on Enter and clearing on Esc', async () => {
    await openChangedFile();
    await page.locator('.diff-view .virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page.locator('.search-box-input');
    await waitForFocus(field, 'the find field');
    await field.fill('T');
    const count = page.locator('.search-count');
    await page.locator('.search-count', { hasText: '1 of 2' }).waitFor();
    assert.deepStrictEqual(
      await page.locator('.diff-line .find-match').allTextContents(),
      ['t', 't'],
    );
    assert.strictEqual(
      await page
        .locator('.diff-line', { has: page.locator('.find-match.current') })
        .locator('.code')
        .textContent(),
      'two',
    );
    await assertFillsRows(
      page.locator('.diff-line .find-match.current'),
      '.diff-line',
    );
    await field.press('Enter');
    await page.locator('.search-count', { hasText: '2 of 2' }).waitFor();
    const marks = page.locator('.diff-view > .scrollbar-marks');
    const found = marks.locator('.scrollbar-mark.match');
    const added = marks.locator('.scrollbar-mark.added');
    await waitForCount(found, 2, 'match marks');
    await added.first().waitFor();
    await page.locator('.row.group', { hasText: 'All Changes' }).click();
    await page.locator('.search-count', { hasText: '1 of 2' }).waitFor();
    await marks.waitFor();
    await waitForCount(found, 2, 'match marks');
    await added.first().waitFor();
    await field.press('Escape');
    await count.waitFor({ state: 'detached' });
    await waitForCount(page.locator('.find-match'), 0, 'matches');
  });

  test('opens the diff search from its round button, giving it the header but for going back, the toggles inside its box and stepping between matches, matching case while its toggle is pressed, and closes it from the back button', async () => {
    await openChangedFile();
    const diff = page.locator('.columns > .column').nth(2);
    await diff.locator('.column-actions > .search-button').click();
    const field = page.locator('.search-box-input');
    await waitForFocus(field, 'the find field');
    assert.strictEqual(await diff.locator('.diff-options').count(), 0);
    const titles = (selector: string) =>
      diff
        .locator(selector)
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('data-tip')),
        );
    assert.deepStrictEqual(await titles('.column-title .nav-button'), [
      'Close',
      'Previous Match',
      'Next Match',
    ]);
    assert.deepStrictEqual(await titles('.search-box .search-toggle'), [
      'Match Case',
      'Whole Word',
      'Use Regular Expression',
    ]);
    await field.fill('T');
    await page.locator('.diff-line .find-match').first().waitFor();
    const matchCase = diff.locator('.search-toggle[data-tip="Match Case"]');
    await matchCase.click();
    await diff.locator('.search-count', { hasText: 'No matches' }).waitFor();
    assert.strictEqual(await matchCase.getAttribute('aria-pressed'), 'true');
    await waitForFocus(field, 'the find field');
    await matchCase.click();
    await diff.locator('.search-count', { hasText: '1 of 2' }).waitFor();
    await diff.locator('.search-bar > .nav-button').first().click();
    await field.waitFor({ state: 'detached' });
    await waitForCount(page.locator('.find-match'), 0, 'matches');
    await diff.locator('.diff-options').waitFor();
  });

  test('gives the keyboard back to the diff once Esc closes the find field', async () => {
    await openChangedFile();
    await page.locator('.diff-view .virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(page.locator('.search-box-input'), 'the find field');
    await page.keyboard.press('Escape');
    await waitForFocus(page.locator('.diff-view .virtual-rows'), 'the diff');
  });

  test('keeps the keyboard in the diff once it is drawn anew for a commit selected from there, such as on Ctrl+Down', async () => {
    await openChangedFile();
    await page.locator('.diff-view .virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+ArrowDown');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await waitForFocus(page.locator('.diff-view .virtual-rows'), 'the diff');
  });

  test('shows all the changes of a file first, then its staged and unstaged halves apart', async () => {
    const file = path.join(repository.root, 'changed.txt');
    fs.writeFileSync(file, 'one\nstaged\nthree\n');
    try {
      await page.locator('.commit', { hasText: 'second' }).click();
      await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
      await repository.git('add', 'changed.txt');
      fs.writeFileSync(file, 'one\nstaged\nunstaged\n');
      await page
        .locator('.commit.working-tree', { hasText: '1 uncommitted change' })
        .click();
      await page
        .locator('.row.group.selected', { hasText: 'All Changes' })
        .waitFor();
      await page.locator('.diff-line.added', { hasText: 'unstaged' }).waitFor();
      assert.deepStrictEqual(
        await page.locator('.diff-line.added .code').allTextContents(),
        ['staged', 'unstaged'],
      );
      await page.locator('.row.group', { hasText: /^Staged/ }).click();
      await page
        .locator('.diff-line.added', { hasText: 'unstaged' })
        .waitFor({ state: 'detached' });
      await page
        .locator('.diff-line.added .code', { hasText: /^staged$/ })
        .waitFor();
      assert.deepStrictEqual(
        await page.locator('.diff-line.added .code').allTextContents(),
        ['staged'],
      );
      await page
        .locator('.row.file', { hasText: 'changed.txt' })
        .nth(1)
        .click();
      await page.locator('.diff-line.added', { hasText: 'unstaged' }).waitFor();
      assert.deepStrictEqual(
        await page.locator('.diff-line.added .code').allTextContents(),
        ['unstaged'],
      );
    } finally {
      await repository.git('checkout', '-q', 'HEAD', '--', 'changed.txt');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
  });

  test('jumps to the first change of a file once selected, and again once shown entire or not, landing where J would', async () => {
    const file = path.join(repository.root, 'long.txt');
    fs.writeFileSync(
      file,
      `${longLines.map((line, index) => (index === 150 ? 'changed far down' : line)).join('\n')}\n`,
    );
    const change = page.locator('.diff-line.removed', {
      hasText: 'line150 word0',
    });
    const belowTop = () =>
      change.evaluate((element) => {
        const drawnAnewSinceFound = !element.isConnected;
        if (drawnAnewSinceFound) {
          return undefined;
        }
        const list = element.closest('.virtual-rows');
        if (!list) {
          throw new Error('No diff list');
        }
        return Math.round(
          element.getBoundingClientRect().top -
            list.getBoundingClientRect().top,
        );
      });
    try {
      await page.locator('.commit', { hasText: 'second' }).click();
      await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
      await page
        .locator('.commit.working-tree', { hasText: '1 uncommitted change' })
        .click();
      await page.locator('.row.file', { hasText: 'long.txt' }).click();
      await change.waitFor();
      const row = await drawnCodeRow();
      await waitFor(
        async () => (await belowTop()) === Math.round(3 * row),
        'the change to be shown at its place',
      );
      await page.getByRole('button', { name: 'Show the Entire File' }).click();
      await page
        .getByRole('button', { name: 'Show the Entire File', pressed: false })
        .waitFor();
      await waitFor(
        () => savedSetting('diff', 'showEntireFile') === false,
        'the entire file turned off to be saved',
      );
      await waitFor(
        async () =>
          (await page.locator('.diff-line').count()) < 20 &&
          (await belowTop()) === Math.round(4 * row),
        'only the changes to be shown, too few to scroll',
      );
      await page.getByRole('button', { name: 'Show the Entire File' }).click();
      await page
        .getByRole('button', { name: 'Show the Entire File', pressed: true })
        .waitFor();
      await waitFor(
        async () => (await belowTop()) === Math.round(3 * row),
        'the entire file to be shown at its change',
      );
      await waitFor(
        () => savedSetting('diff', 'showEntireFile') === undefined,
        'the entire file left to the default again',
      );
    } finally {
      await repository.git('checkout', '-q', 'HEAD', '--', 'long.txt');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
  });
});
