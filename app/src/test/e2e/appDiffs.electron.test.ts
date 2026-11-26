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
import {
  diffFinds,
  diffLinesSeen,
  diffListTop,
  diffSides,
  diffTexts,
  untilDiffLine,
  type DiffLineSeen,
} from './diffSeen';
import { commitRow } from './commitRows';
import { fileRow } from './fileRows';

const commented = (answer: number) =>
  `/* the answer\na\nb\nc\n*/\nexport const answer = ${answer};\n`;

const colored =
  (kind: string, text?: string) =>
  ({ kinds }: DiffLineSeen) =>
    kinds.some(
      ([piece, named]) =>
        named === kind && (text === undefined || piece.includes(text)),
    );

const noFinds = () =>
  waitFor(
    async () => (await diffFinds(page)).length === 0,
    'no match marked in the diff',
  );

async function addedShown(lines: readonly string[]): Promise<void> {
  let shown: string[] = [];
  await waitFor(
    async () => {
      shown = await diffTexts(page, 'added');
      return shown.join('\n') === lines.join('\n');
    },
    `the added lines ${lines.join(', ')}`,
  ).catch(() => undefined);
  assert.deepStrictEqual(shown, lines);
}

const changedFarDown = ({ change, text }: DiffLineSeen) =>
  change === 'removed' && text.includes('line150 word0');

const belowTop = async () => {
  const line = (await diffLinesSeen(page)).find(changedFarDown);
  return line === undefined
    ? undefined
    : Math.round(line.top - (await diffListTop(page)));
};

suite('App', () => {
  sharedApp({
    'code.ts': 'export const answer = 42;\n',
    'commented.ts': commented(42),
    'long.txt': `${longLines.join('\n')}\n`,
  });

  test('colors code away from the page, offers every language for a file selected from a button in line with the others, opening rightwards from the button, as it starts the toolbar, marking what its filter found as tall as the item it is on, but only Auto and Plain Text for many, leaves code plain on Plain Text until Auto, and colors a file in a language chosen for it until another is selected', async () => {
    await commitRow(page, 'first').click();
    await fileRow(page, 'code.ts', { kind: 'file' }).click();
    await untilDiffLine(
      page,
      colored('keyword', 'export'),
      'the keyword colored',
    );
    await untilDiffLine(page, colored('number', '42'), 'the number colored');
    const button = page.locator('.diff-options .language-button');
    const label = () => button.locator('.menu-button-label').textContent();
    const keywords = async () =>
      (await diffLinesSeen(page)).filter(colored('keyword')).length;
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
    await waitFor(async () => (await keywords()) === 0, 'the code drawn plain');
    assert.strictEqual(await label(), 'Plain Text');
    await choose('TypeScript', 'typescript');
    await waitFor(async () => (await keywords()) > 0, 'the code colored');
    assert.strictEqual(await label(), 'TypeScript');

    await fileRow(page, 'All Changes', { kind: 'header' }).click();
    await fileRow(page, 'All Changes', {
      kind: 'header',
      selected: true,
    }).waitFor();
    assert.strictEqual(await label(), 'Plain Text');
    await waitFor(async () => (await keywords()) === 0, 'the code drawn plain');
    await button.locator('.menu-button-trigger').click();
    assert.deepStrictEqual(
      await button.locator('.menu-item').allTextContents(),
      ['Auto', '✓Plain Text'],
    );
    assert.strictEqual(await button.locator('.search-box-input').count(), 0);
    await button.locator('.menu-item', { hasText: /^Auto$/ }).click();
    await waitFor(async () => (await keywords()) > 0, 'the code colored');
    assert.strictEqual(await label(), 'Auto');
    await fileRow(page, 'code.ts', { kind: 'file' }).click();
    await waitFor(async () => (await label()) === 'TypeScript', 'the language');
  });

  test('keeps the lines of a diff colored as the whole text of their side has it while the working tree changes under it', async () => {
    const file = path.join(repository.root, 'commented.ts');
    fs.writeFileSync(file, commented(43));
    let watching:
      JSHandle<{ uncolored: string[]; stop: () => void }> | undefined;
    try {
      await fileRow(page, 'commented.ts', { kind: 'file' }).click();
      await untilDiffLine(
        page,
        colored('comment', '*/'),
        'the end of the comment colored',
      );
      watching = await page.evaluateHandle((sides) => {
        const expected = new Map([
          ['b', 'comment'],
          ['c', 'comment'],
          ['*/', 'comment'],
          ['export const answer = 42;', 'keyword'],
        ]);
        const uncolored: string[] = [];
        let watched = true;
        const look = () => {
          for (const host of document.querySelectorAll(sides)) {
            const rows =
              host instanceof HTMLElement ? (host.seenRows?.() ?? []) : [];
            for (const { text, pieces } of rows) {
              const kind = expected.get(text);
              if (
                kind !== undefined &&
                !pieces.some((piece) => piece.kind === kind)
              ) {
                uncolored.push(text);
              }
            }
          }
          if (watched) {
            requestAnimationFrame(look);
          }
        };
        look();
        return {
          uncolored,
          stop: () => {
            watched = false;
          },
        };
      }, diffSides);
      for (const answer of [44, 45, 46]) {
        fs.writeFileSync(file, commented(answer));
        await untilDiffLine(
          page,
          colored('number', String(answer)),
          `the answer ${answer} colored`,
        );
      }
      assert.deepStrictEqual(
        await watching.evaluate(({ uncolored }) => uncolored),
        [],
      );
    } finally {
      await watching?.evaluate(({ stop }) => stop());
      await repository.git('checkout', '-q', 'HEAD', '--', 'commented.ts');
    }
    await commitRow(page, 'No uncommitted changes').waitFor();
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
    assert.deepStrictEqual(await diffFinds(page), ['t', 't']);
    assert.strictEqual(
      (await diffLinesSeen(page)).find(({ marks }) =>
        marks.some(({ name }) => name === 'current'),
      )?.text,
      'two',
    );
    await field.press('Enter');
    await page.locator('.search-count', { hasText: '2 of 2' }).waitFor();
    const marks = page.locator('.diff-view > .scrollbar-marks');
    const found = marks.locator('.scrollbar-mark.match');
    const added = marks.locator('.scrollbar-mark.added');
    await waitForCount(found, 2, 'match marks');
    await added.first().waitFor();
    await fileRow(page, 'All Changes', { kind: 'header' }).click();
    await page.locator('.search-count', { hasText: '1 of 2' }).waitFor();
    await marks.waitFor();
    await waitForCount(found, 2, 'match marks');
    await added.first().waitFor();
    await field.press('Escape');
    await count.waitFor({ state: 'detached' });
    await noFinds();
  });

  test('opens the diff search on Ctrl+F floating over the top right of the diff, its header kept, the toggles inside its box, stepping between matches and an X closing it at its end, matching case while its toggle is pressed, and closes it from the X', async () => {
    await openChangedFile();
    const diff = page.locator('.columns > .column').nth(2);
    await page.locator('.diff-view .virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page.locator('.search-box-input');
    await waitForFocus(field, 'the find field');
    assert.strictEqual(await diff.locator('.diff-options').count(), 1);
    assert.strictEqual(await diff.locator('.column-actions').count(), 0);
    const titles = (selector: string, attribute = 'data-tip') =>
      diff
        .locator(selector)
        .evaluateAll(
          (buttons, name) => buttons.map((button) => button.getAttribute(name)),
          attribute,
        );
    assert.deepStrictEqual(await titles('.floating-search .nav-button'), [
      null,
      null,
      null,
    ]);
    assert.deepStrictEqual(
      await titles('.floating-search .nav-button', 'aria-label'),
      ['Previous Match', 'Next Match', 'Close'],
    );
    assert.deepStrictEqual(await titles('.search-box .search-toggle'), [
      'Match Case',
      'Whole Word',
      'Use Regular Expression',
    ]);
    await field.fill('T');
    await waitFor(
      async () => (await diffFinds(page)).length > 0,
      'a match marked in the diff',
    );
    const matchCase = diff.locator('.search-toggle[data-tip="Match Case"]');
    await matchCase.click();
    await diff.locator('.search-count', { hasText: 'No matches' }).waitFor();
    assert.strictEqual(await matchCase.getAttribute('aria-pressed'), 'true');
    await waitForFocus(field, 'the find field');
    await matchCase.click();
    await diff.locator('.search-count', { hasText: '1 of 2' }).waitFor();
    await diff.locator('.search-bar > .nav-button').last().click();
    await field.waitFor({ state: 'detached' });
    await noFinds();
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
    await commitRow(page, 'first', { selected: true }).waitFor();
    await waitForFocus(page.locator('.diff-view .virtual-rows'), 'the diff');
  });

  test('shows all the changes of a file first, then its staged and unstaged halves apart', async () => {
    const file = path.join(repository.root, 'changed.txt');
    fs.writeFileSync(file, 'one\nstaged\nthree\n');
    try {
      await commitRow(page, 'second').click();
      await commitRow(page, 'second', { selected: true }).waitFor();
      await repository.git('add', 'changed.txt');
      fs.writeFileSync(file, 'one\nstaged\nunstaged\n');
      await commitRow(page, '1 uncommitted change').click();
      await fileRow(page, 'All Changes', {
        kind: 'header',
        selected: true,
      }).waitFor();
      await addedShown(['staged', 'unstaged']);
      await fileRow(page, /^Staged/, { kind: 'header' }).click();
      await addedShown(['staged']);
      await fileRow(page, 'changed.txt', { kind: 'file' }).nth(1).click();
      await addedShown(['unstaged']);
    } finally {
      await repository.git('checkout', '-q', 'HEAD', '--', 'changed.txt');
    }
    await commitRow(page, 'No uncommitted changes').waitFor();
  });

  test('jumps to the first change of a file once selected, and again once shown entire or not, landing where J would', async () => {
    const file = path.join(repository.root, 'long.txt');
    fs.writeFileSync(
      file,
      `${longLines.map((line, index) => (index === 150 ? 'changed far down' : line)).join('\n')}\n`,
    );
    try {
      await commitRow(page, 'second').click();
      await commitRow(page, 'second', { selected: true }).waitFor();
      await commitRow(page, '1 uncommitted change').click();
      await fileRow(page, 'long.txt', { kind: 'file' }).click();
      await untilDiffLine(page, changedFarDown, 'the line changed far down');
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
          (await diffLinesSeen(page)).length < 20 &&
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
    await commitRow(page, 'No uncommitted changes').waitFor();
  });
});
