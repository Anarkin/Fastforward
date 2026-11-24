import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import {
  cellPoint,
  copied,
  dragOver,
  keepCopied,
  seenDots,
  seenGlyphs,
  seenMarked,
  seenRows,
} from './cellsSeen';
import { untilSettled, waitForFocus } from './waits';
import {
  opened,
  page,
  rowNames,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';
import { firstViewerRow, rowTexts } from './viewerAppFixtures';

const hexColumn = (byte: number) => 11 + byte * 3 + (byte >= 8 ? 1 : 0);

const textColumn = (byte: number) => 62 + byte;

const selectedRanges = async () =>
  (await seenRows(page))
    .filter(({ selections }) => (selections ?? []).length > 0)
    .map(({ text, selections }) =>
      (selections ?? []).map(({ from, to }) => text.slice(from, to)),
    );

const pressedMode = () =>
  page
    .locator('.viewer .toolbar[role="group"] [aria-pressed="true"]')
    .getAttribute('data-tip');

const blanks = async () => ({
  dots: (await seenDots(page)).map(({ column }) => column),
  ...Object.fromEntries(
    await Promise.all(
      [
        strings.symbols.tab,
        strings.symbols.carriageReturn,
        strings.symbols.lineFeed,
      ].map(async (sign) => [
        sign,
        (await seenGlyphs(page, sign)).map(({ column }) => column),
      ]),
    ),
  ),
});
const signsAt = (at: (byte: number) => number) => ({
  dots: [at(2)],
  [strings.symbols.tab]: [at(4)],
  [strings.symbols.carriageReturn]: [at(6)],
  [strings.symbols.lineFeed]: [at(8)],
});

const markedOffsets = (what: string) =>
  untilSettled(
    async () =>
      (await seenRows(page)).flatMap(({ key, marks }) =>
        marks
          .filter(({ name }) => name === 'occurrence')
          .map(({ from }) => Number(key.slice(0, key.indexOf(':'))) + from),
      ),
    what,
    { accepted: (offsets) => offsets.length > 1 },
  );

suite('App commander', () => {
  sharedCommanderApp();

  test('keeps what a viewing tab was switched to show its file as while another tab is shown, for when it is shown again, and views the file as at first in a tab opened after it closed, which can take its id', async () => {
    fs.writeFileSync(path.join(opened, 'kept.md'), '# Kept\n');
    const viewerTab = page.locator('.tabs [role="tab"]', {
      hasText: 'kept.md',
    });
    try {
      await select('kept');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await pressedMode()) === strings.viewer.viewPreview,
        'the preview',
      );
      await page
        .locator('.viewer .toolbar[role="group"]')
        .getByRole('button', { name: strings.viewer.viewText })
        .click();
      await waitFor(
        async () => (await pressedMode()) === strings.viewer.viewText,
        'the text',
      );

      await page.locator('.tabs [role="tab"]:has(.tool-commander)').click();
      await page.locator('.viewer').waitFor({ state: 'detached' });
      await viewerTab.click();
      await page.locator('.viewer').waitFor();
      assert.strictEqual(await pressedMode(), strings.viewer.viewText);

      await page.locator('.viewer .column-body').first().focus();
      await page.keyboard.press('Escape');
      await viewerTab.waitFor({ state: 'detached' });
      await select('kept');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await pressedMode()) === strings.viewer.viewPreview,
        'the preview of a tab opened anew',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.locator('.viewer .column-body').first().focus();
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'kept.md'));
      await waitFor(
        async () => !(await rowNames()).includes('kept.md'),
        'the file to be gone from the list',
      );
    }
  });

  test('marks the bytes of whitespace among the characters of Bytes and of Hex while whitespace is shown, a space by its dot and a tab, a carriage return and a line feed by their signs, as text marks them, and none in the hex digits or once whitespace is hidden', async () => {
    fs.writeFileSync(
      path.join(opened, 'blanks.bin'),
      Buffer.from('\u0000a b\tc\rd\ne', 'latin1'),
    );
    await select('blanks');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await firstViewerRow()) === '¤a b¤c¤d¤e',
      'the bytes of a binary file',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    const inBytes = await untilSettled(blanks, 'the bytes drawn');
    await page.keyboard.press('1');
    await waitFor(
      async () => (await firstViewerRow()).endsWith('   ¤a b¤c¤d¤e'),
      'the bytes in hex',
    );
    const inHex = await untilSettled(blanks, 'the hex drawn');
    await page.keyboard.press('.');
    const hidden = await untilSettled(blanks, 'the hex drawn plain');
    await page.keyboard.press('.');
    await page.keyboard.press('Escape');
    assert.deepStrictEqual(
      { inBytes, inHex, hidden },
      {
        inBytes: signsAt((byte) => byte),
        inHex: signsAt(textColumn),
        hidden: {
          dots: [],
          [strings.symbols.tab]: [],
          [strings.symbols.carriageReturn]: [],
          [strings.symbols.lineFeed]: [],
        },
      },
    );
  });

  test('marks the copies of the bytes selected among the bytes of a file by their value, as Hex marks them, rather than every byte drawn as the same dot, far from the selection too, as the bytes sought were taken from the bytes read around the screen, which held them no longer', async () => {
    fs.writeFileSync(
      path.join(opened, 'cycle.bin'),
      Buffer.from(Array.from({ length: 4_000_000 }, (_, index) => index % 256)),
    );
    await select('cycle');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await firstViewerRow()).startsWith('¤¤¤'),
      'the bytes of a binary file',
    );
    const first = await cellPoint(page, 0, 0);
    await page.mouse.dblclick(first.x, first.y);
    const marked = await markedOffsets(
      'the copies of the byte selected marked',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('End');
    await waitFor(async () => {
      const [shown] = await seenRows(page);
      return (
        shown !== undefined &&
        Number(shown.key.slice(0, shown.key.indexOf(':'))) > 3_000_000
      );
    }, 'the end of the file shown');
    const far = await markedOffsets('the copies marked far from the selection');
    await page.keyboard.press('Escape');
    assert.deepStrictEqual(
      [...marked, ...far].filter((offset) => offset % 256 !== 0),
      [],
      `marked at ${marked.join(', ')} and far at ${far.join(', ')}`,
    );
    assert.ok(Math.min(...far) > 3_000_000, `far at ${far.join(', ')}`);
  });

  test('shows a binary file in hex, 16 bytes a row, to its last row with End, and switches to text and back with 2 and 1 or the buttons', async () => {
    fs.writeFileSync(
      path.join(opened, 'data.bin'),
      Buffer.from(Array.from({ length: 65536 }, (_, index) => index % 256)),
    );
    await select('data');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'a binary file to open as text',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('1');
    await waitFor(
      async () =>
        (await firstViewerRow()) ===
        '00000000   00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F   ¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤',
      'the first row in hex',
    );
    const pair = await cellPoint(page, 0, 11);
    await page.mouse.dblclick(pair.x, pair.y);
    await waitFor(
      async () => (await seenMarked(page, 'occurrence')).length > 2,
      'the other copies of the byte selected marked in both columns',
    );
    await keepCopied(page);
    await page.keyboard.press('ControlOrMeta+C');
    await waitFor(
      async () => (await copied(page)) !== undefined,
      'the byte copied',
    );
    assert.deepStrictEqual(
      {
        selected: await selectedRanges(),
        marked: [...new Set(await seenMarked(page, 'occurrence'))],
        copied: await copied(page),
      },
      { selected: [['00', '¤']], marked: ['00', '¤'], copied: '00' },
    );

    const draggedCopy = async (
      from: readonly [number, number],
      to: readonly [number, number],
    ) => {
      await dragOver(page, from, to);
      await keepCopied(page);
      await page.keyboard.press('ControlOrMeta+C');
      await waitFor(
        async () => (await copied(page)) !== undefined,
        'the bytes copied',
      );
      return { selected: await selectedRanges(), copied: await copied(page) };
    };
    assert.deepStrictEqual(
      [
        await draggedCopy([4, hexColumn(14)], [5, hexColumn(2)]),
        await draggedCopy([4, textColumn(14)], [5, textColumn(2)]),
      ],
      [
        {
          selected: [
            ['4E 4F', 'NO'],
            ['50 51', 'PQ'],
          ],
          copied: '4E 4F 50 51',
        },
        {
          selected: [
            ['4E 4F', 'NO'],
            ['50 51', 'PQ'],
          ],
          copied: 'NOPQ',
        },
      ],
    );

    await page.keyboard.press('End');
    await waitFor(
      async () =>
        ((await rowTexts()).at(-1) ?? '').startsWith('0000FFF0   F0 F1'),
      'the last row',
    );

    await page.keyboard.press('F1');
    await waitFor(
      async () =>
        (await page.locator('.shortcuts-heading').allTextContents()).includes(
          'Text',
        ),
      'the shortcuts of the viewer',
    );
    assert.ok(
      !(await page.locator('.shortcuts-heading').allTextContents()).includes(
        'Listing',
      ),
    );
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading')
      .first()
      .waitFor({ state: 'detached' });

    await page.keyboard.press('2');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    await page.keyboard.press('Home');
    await waitFor(
      async () =>
        ((await firstViewerRow()) ?? '').startsWith(
          `${'¤'.repeat(32)} !"#$%&'()*+,-./0123456789`,
        ),
      'the bytes as text, one to a character, the sign of the invisible for each with no glyph',
    );
    await page.keyboard.press('1');
    await waitFor(async () => (await pressedMode()) === 'Hex', 'the hex view');
    await page
      .locator('.viewer .toolbar[role="group"] [data-tip="Text"]')
      .click();
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });

    fs.writeFileSync(path.join(opened, 'plain.txt'), 'plain');
    await select('plain');
    await page.keyboard.press('F3');
    await waitFor(async () => (await firstViewerRow()) === 'plain', 'the text');
    assert.strictEqual(await pressedMode(), 'Text');
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'data.bin'));
    fs.rmSync(path.join(opened, 'plain.txt'));
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('data.bin') && !names.includes('plain.txt');
    }, 'the files to be gone from the list');
  });
});
