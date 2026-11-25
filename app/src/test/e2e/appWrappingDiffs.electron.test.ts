import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { wrapColumns, wrappedLines } from '../../lib/page/wordWrap';
import {
  openChangedFile,
  page,
  profile,
  savedSetting,
  app,
  sharedApp,
  whitespaceShownSaved,
  wrapsSaved,
} from './appFixtures';
import { baseSettings } from './appLaunch';
import { cellsOf } from './cellsSeen';
import {
  diffFinds,
  diffLinesSeen,
  diffRowsSeen,
  diffSides,
  untilDiffLine,
  type DiffLineSeen,
} from './diffSeen';
import { gridLines } from './gridLines';
import { barOf, barParts } from './scrollbarsShown';
import { waitForCount, waitForFocus } from './waits';
import { waitFor } from '../helpers/fixtures';
import {
  codeRow,
  near,
  lineHeights,
  matchInView,
  wrapColumnsShown,
} from './wrappingFixtures';
import {
  hyphenatedLine,
  dottedLine,
  breakLines,
  longestLine,
  minifiedLine,
  paddedLine,
  longLines,
} from './wrappingSamples';
import { writeSettings } from './settingsWritten';
import { commitRow } from './commitRows';

const spacedLine = `one two three four five ${'x'.repeat(3000)}`;

const wraps = ({ rows }: DiffLineSeen) => rows.length > 1;

async function barsOff(): Promise<number[]> {
  const last: number[] = [];
  for (const { row, column } of await cellsOf(page, diffSides).glyphs('|')) {
    last[row] = Math.max(last[row] ?? 0, column);
  }
  const [ruler, ...rows] = Object.values(last);
  return rows.map((column) => column - (ruler ?? Number.NaN));
}

const settled = () =>
  untilDiffLine(
    page,
    ({ text, rows }) =>
      text.includes('What it does') &&
      rows.length > 1 &&
      rows.filter(({ breakAt }) => breakAt !== undefined).length ===
        rows.length - 1,
    'a mark at the end of every row but the last',
  );

const firsts = ({ rows }: DiffLineSeen) =>
  rows.map(({ text }) => text.slice(0, 1));

const textStart = async () => {
  const row = (await diffRowsSeen(page)).find(({ side }) => side === 1);
  return row === undefined ? undefined : row.left - row.column * row.advance;
};

suite('App', () => {
  sharedApp({
    'long.txt': `${longLines.join('\n')}\n`,
    'hyphenated.txt': `${hyphenatedLine}\n`,
    'wrapped.txt': `${dottedLine}\n`,
    'padded.txt': `${paddedLine}\n`,
    'breaks.txt': `${breakLines.join('\n')}\n`,
    'longest.txt': `${longestLine}\n`,
    'minified.txt': `${minifiedLine}\n`,
    'grid.txt': `${gridLines.join('\n')}\n`,
    'grid.js': `${gridLines.join('\n')}\n`,
    'spaced.txt': `${spacedLine}\n`,
  });

  test('scrolls a wrapped diff to each match found in a line wrapped onto more rows than the view holds, rather than to the middle of the line, as stepping between the matches of such a line left them out of view', async () => {
    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'longest.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await untilDiffLine(page, wraps, 'a line wrapped onto rows');
    await page.locator('.diff-view .virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page.locator('.search-box-input');
    await waitForFocus(field, 'the find field');
    await field.fill('999');
    for (const match of [1, 2, 3, 4]) {
      if (match > 1) {
        await field.press('Enter');
      }
      await page
        .locator('.search-count', { hasText: `${match} of 4` })
        .waitFor();
      await waitFor(matchInView, `match ${match} in view`);
    }
    await field.press('Escape');
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('wraps a line padded with runs of spaces onto as many rows as the app estimates, the same whether whitespace is shown or not, each run hanging at the end of its row rather than broken onto rows of its own', async () => {
    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'padded.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page.locator('.diff-view.show-whitespace').waitFor();
    const shown = await settled();
    await page
      .getByRole('button', { name: 'Show Whitespace', exact: true })
      .click();
    await page
      .locator('.diff-view.show-whitespace')
      .waitFor({ state: 'detached' });
    const hidden = await settled();
    const { width, char } = await wrapColumnsShown();
    assert.strictEqual(shown.text, paddedLine);
    assert.deepStrictEqual(firsts(shown), firsts(hidden));
    assert.deepStrictEqual(
      firsts(hidden),
      hidden.rows.map(() => '|'),
    );
    assert.strictEqual(
      shown.rows.length,
      wrappedLines(paddedLine, wrapColumns(width, char)),
    );
    await waitFor(
      () => wrapsSaved() && !whitespaceShownSaved(),
      'the choices to be saved',
    );
  });

  test('draws the lines of a diff on the grid of our terminal, an emoji or a Chinese, Japanese or Korean character two columns, an emoji joined from several one too, so text padded for a terminal lines up, each line a row tall when wrapped too, the commits hidden to give its lines of 41 columns room in a small window, as a shrunk emoji made its line two, colored by its syntax, with whitespace shown, and while a match found ends inside a character of several code points', async () => {
    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'grid.js' }).click();
    await page.keyboard.press('c');
    await page.locator('.columns.commits-hidden').waitFor();
    try {
      const onGrid = gridLines.slice(1).map(() => 0);
      await untilDiffLine(
        page,
        ({ kinds }) => kinds.some(([, kind]) => kind !== 'plain'),
        'the lines colored',
      );
      await waitFor(
        async () => (await diffLinesSeen(page)).length === gridLines.length,
        'every line',
      );
      assert.deepStrictEqual(await barsOff(), onGrid);
      await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
      await page.locator('.diff-view.wrap').waitFor();
      await waitFor(
        async () => (await lineHeights()).length === gridLines.length,
        'every line wrapped',
      );
      const tall = await lineHeights();
      assert.deepStrictEqual(
        tall,
        tall.map(() => tall[0]),
      );
      assert.deepStrictEqual(await barsOff(), onGrid);
      const showWhitespace = page.getByRole('button', {
        name: 'Show Whitespace',
        exact: true,
      });
      await showWhitespace.click();
      await page
        .locator('.diff-view.show-whitespace')
        .waitFor({ state: 'detached' });
      assert.deepStrictEqual(await barsOff(), onGrid);
      await showWhitespace.click();
      await page.locator('.diff-view.show-whitespace').waitFor();
      assert.deepStrictEqual(await barsOff(), onGrid);
      await page.locator('.diff-view .virtual-rows').focus();
      await page.keyboard.press('ControlOrMeta+F');
      const field = page.locator('.search-box-input');
      await waitForFocus(field, 'the find field');
      await field.fill('Cafe');
      await waitFor(
        async () => (await diffFinds(page)).length > 0,
        'the match marked',
      );
      assert.deepStrictEqual(await barsOff(), onGrid);
      await field.press('Escape');
      await waitFor(
        () => wrapsSaved() && whitespaceShownSaved(),
        'the choices to be saved',
      );
    } finally {
      await page.keyboard.press('c');
      await page
        .locator('.columns.commits-hidden')
        .waitFor({ state: 'detached' });
    }
  });

  test('makes each line of the diff as tall as the font size of code times the line height set, rounded to whole device pixels, placing the rows and the marks of wrapped ones that far apart, the file header a line tall too', async () => {
    await writeSettings(page, profile, {
      ...baseSettings,
      fonts: { monospaceLineHeight: 2.1 },
    });
    await openChangedFile();
    const tall = await codeRow(2.1);
    await untilDiffLine(
      page,
      ({ rows: [row] }) => near(row?.height, tall),
      'the lines as tall as set',
    );
    const header = await page
      .locator('.diff-view .diff-row:has(> .file-header)')
      .first()
      .evaluate((element) => {
        const shown = element.querySelector('.file-header');
        return {
          kind: 'file',
          top: element.getBoundingClientRect().top,
          height: element.getBoundingClientRect().height,
          shown: shown?.getBoundingClientRect().height ?? 0,
        };
      });
    const rows = [
      header,
      ...(await diffLinesSeen(page)).map(({ top, rows: [row] }) => ({
        kind: 'line',
        top,
        height: row?.height ?? 0,
        shown: row?.height ?? 0,
      })),
    ];
    assert.deepStrictEqual(
      rows.map(({ kind, height, shown }) => [
        kind,
        near(height, tall),
        near(shown, tall),
      ]),
      [
        ['file', true, true],
        ['line', true, true],
        ['line', true, true],
        ['line', true, true],
        ['line', true, true],
      ],
    );
    assert.deepStrictEqual(
      rows.slice(1).map((row, index) => near(row.top - rows[index].top, tall)),
      [true, true, true, true],
    );

    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const wrapped = await untilDiffLine(
      page,
      wraps,
      'a line wrapped onto rows',
    );
    assert.deepStrictEqual(
      wrapped.rows.map(({ top, height, breakAt }, index) => [
        near(top - wrapped.top, index * tall),
        near(height, tall),
        breakAt !== undefined,
      ]),
      wrapped.rows.map((_, index) => [
        true,
        true,
        index < wrapped.rows.length - 1,
      ]),
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('scrolls the two sides of a side by side diff together on the sideways scrollbar below either, both showing how far they are scrolled, and takes the two away once the lines are wrapped', async () => {
    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.getByRole('button', { name: 'Side by Side' }).click();
    const bars = '.diff-view .scroll-proxy.horizontal';
    await waitForCount(page.locator(bars), 2, 'sideways scrollbars');
    const thumbBelow = async (side: number) => {
      const { box } = await barOf(page, `${bars} >> nth=${side}`, 'horizontal');
      const { thumb, end } = await barParts(page, box, 'horizontal');
      assert.ok(thumb, `the scrollbar below side ${side} has no thumb`);
      return {
        thumb,
        along: thumb.left - box.left,
        room: end.left - thumb.left - thumb.width,
      };
    };
    const before = await textStart();
    assert.ok(before !== undefined, 'the second side shows no code');
    const right = await thumbBelow(1);
    const left = await thumbBelow(0);
    assert.ok(
      Math.abs(left.along - right.along) <= 1,
      `${left.along} is not ${right.along}`,
    );
    const y = left.thumb.top + left.thumb.height / 2;
    await page.mouse.move(left.thumb.left + 5, y);
    await page.mouse.down();
    await page.mouse.move(left.thumb.left + 105, y, { steps: 5 });
    await page.mouse.up();
    await waitFor(async () => {
      const after = await textStart();
      return after !== undefined && after < before - 100;
    }, 'the code to scroll sideways');
    const far = Math.min(90, left.room - 2);
    let moved = [left.along, right.along];
    await waitFor(async () => {
      moved = [(await thumbBelow(0)).along, (await thumbBelow(1)).along];
      return moved.every(
        (along) =>
          along > left.along + far && Math.abs(along - (moved[0] ?? 0)) <= 1,
      );
    }, 'both scrollbars to move along together').catch((error: unknown) => {
      throw new Error(
        `${String(error)}: ${JSON.stringify({ moved, from: left.along, far })}`,
      );
    });

    await page.keyboard.press('w');
    await page.locator('.diff-view.wrap').waitFor();
    await waitForCount(page.locator(bars), 0, 'sideways scrollbars');
    await page.getByRole('button', { name: 'Inline' }).click();
    await waitFor(
      () => wrapsSaved() && savedSetting('diff', 'diffLayout') === 'inline',
      'the last choices to be saved',
    );
  });

  test('paints a dot in each space of a line of thousands of characters not wrapped, read from the pixels of the window, as a gradient as wide as such a line painted none of the few dots it held while its styles said they were there', async () => {
    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'spaced.txt' }).click();
    const line = await untilDiffLine(
      page,
      ({ text }) => text.startsWith('one two'),
      'the line of thousands of characters',
    );
    const [row] = line.rows;
    assert.ok(row, 'the line has no row');
    await waitFor(
      async () => (await cellsOf(page, diffSides).dots()).length === 5,
      'five spaces dotted',
    );
    const ratio = await page.evaluate(() => devicePixelRatio);
    const centers = spacedLine
      .slice(0, 30)
      .split('')
      .flatMap((character, at) =>
        character === ' '
          ? [
              {
                x: Math.floor(
                  (row.left + (at - row.column + 0.5) * row.advance) * ratio,
                ),
                y: Math.floor((row.top + row.height / 2) * ratio),
              },
            ]
          : [],
      );
    assert.strictEqual(centers.length, 5);
    const painted = async () => {
      const shot = await app.evaluate(async ({ BrowserWindow, screen }) => {
        const [window] = BrowserWindow.getAllWindows().toSorted(
          (a, b) => a.id - b.id,
        );
        if (window === undefined) {
          throw new Error('The app has no window.');
        }
        const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
        const image = await window.webContents.capturePage();
        return {
          width: image.getSize(scale).width,
          pixels: image.toBitmap({ scaleFactor: scale }).toString('base64'),
        };
      });
      const pixels = Buffer.from(shot.pixels, 'base64');
      const at = (x: number, y: number) =>
        pixels.subarray((y * shot.width + x) * 4, (y * shot.width + x) * 4 + 3);
      const above = Math.max(4, Math.round((row.advance * ratio) / 2));
      return centers.map(({ x, y }) => !at(x, y).equals(at(x, y - above)));
    };
    await waitFor(
      async () => (await painted()).every(Boolean),
      'a dot painted in each of the five spaces',
      5000,
    ).catch(async (error: unknown) => {
      throw new Error(`${String(error)}: ${JSON.stringify(await painted())}`);
    });
  });
});
