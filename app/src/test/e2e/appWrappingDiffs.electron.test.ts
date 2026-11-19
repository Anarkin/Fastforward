import * as assert from 'node:assert';
import { isDeepStrictEqual } from 'node:util';
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
import { barsOffGrid, gridLines } from './gridLines';
import { barOf, barParts } from './scrollbarsShown';
import { waitForCount, waitForFocus } from './waits';
import { waitFor } from '../helpers/fixtures';
import {
  codeRow,
  near,
  firsts,
  lineHeights,
  laidOutCode,
  matchInView,
  marksFollowRows,
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

const spacedLine = `one two three four five ${'x'.repeat(3000)}`;

function spaceCenters(code: Element): { x: number; y: number }[] {
  const range = document.createRange();
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  const centers: { x: number; y: number }[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (
      let at = text.indexOf(' ');
      at !== -1;
      at = text.indexOf(' ', at + 1)
    ) {
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const { left, right, top, bottom } = range.getBoundingClientRect();
      centers.push({
        x: Math.floor(((left + right) / 2) * devicePixelRatio),
        y: Math.floor(((top + bottom) / 2) * devicePixelRatio),
      });
    }
  }
  return centers;
}

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
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'longest.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page.locator('.diff-view .virtual-row .wrap-break').first().waitFor();
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
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'padded.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = page.locator('.diff-line', { hasText: 'What it does' });
    await line.locator('.wrap-break').first().waitFor();
    const settled = async () => {
      await waitFor(async () => {
        const { rows, marks } = await laidOutCode(line);
        return rows.length > 1 && marks.length === rows.length - 1;
      }, 'a mark at the end of every row but the last');
      return laidOutCode(line);
    };
    await page.locator('.diff-view.show-whitespace').waitFor();
    const shown = await settled();
    await page
      .getByRole('button', { name: 'Show Whitespace', exact: true })
      .click();
    await page
      .locator('.diff-view.show-whitespace')
      .waitFor({ state: 'detached' });
    const hidden = await settled();
    assert.strictEqual(shown.text, paddedLine);
    assert.deepStrictEqual(firsts(shown.rows), firsts(hidden.rows));
    assert.deepStrictEqual(
      firsts(hidden.rows),
      hidden.rows.map(() => '|'),
    );
    assert.strictEqual(
      shown.rows.length,
      wrappedLines(paddedLine, wrapColumns(shown.width, shown.char)),
    );
    await waitFor(
      () => wrapsSaved() && !whitespaceShownSaved(),
      'the choices to be saved',
    );
  });

  test('draws the lines of a diff on the grid of our terminal, an emoji or a Chinese, Japanese or Korean character two columns, an emoji joined from several one too, so text padded for a terminal lines up, each line a row tall when wrapped too, the commits hidden to give its lines of 41 columns room in a small window, as a shrunk emoji made its line two, colored by its syntax, with whitespace shown, and while a match found ends inside a character of several code points', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'grid.js' }).click();
    await page.keyboard.press('c');
    await page.locator('.columns.commits-hidden').waitFor();
    try {
      const code = page.locator('.diff-view .virtual-row .diff-line .code');
      await page.locator('.diff-view [class^="syntax-"]').first().waitFor();
      await waitFor(
        async () => (await code.count()) === gridLines.length,
        'every line',
      );
      assert.deepStrictEqual(
        await code.evaluateAll(barsOffGrid),
        gridLines.slice(1).map(() => 0),
      );
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
      assert.deepStrictEqual(
        await code.evaluateAll(barsOffGrid),
        gridLines.slice(1).map(() => 0),
      );
      const showWhitespace = page.getByRole('button', {
        name: 'Show Whitespace',
        exact: true,
      });
      await showWhitespace.click();
      await page
        .locator('.diff-view.show-whitespace')
        .waitFor({ state: 'detached' });
      assert.deepStrictEqual(
        await code.evaluateAll(barsOffGrid),
        gridLines.slice(1).map(() => 0),
      );
      await showWhitespace.click();
      await page.locator('.diff-view.show-whitespace').waitFor();
      assert.deepStrictEqual(
        await code.evaluateAll(barsOffGrid),
        gridLines.slice(1).map(() => 0),
      );
      await page.locator('.diff-view .virtual-rows').focus();
      await page.keyboard.press('ControlOrMeta+F');
      const field = page.locator('.search-box-input');
      await waitForFocus(field, 'the find field');
      await field.fill('Cafe');
      await page.locator('.diff-line .find-match').first().waitFor();
      assert.deepStrictEqual(
        await code.evaluateAll(barsOffGrid),
        gridLines.slice(1).map(() => 0),
      );
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

  test('moves the marks of a wrapped line along once the browser breaks it elsewhere, as it does when it gets a few pixels narrower, though the app estimates as many characters to a row', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'hyphenated.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = page
      .locator('.diff-line', { has: page.locator('.wrap-break') })
      .first();
    await line.waitFor();
    await waitFor(() => marksFollowRows(line), 'the marks to follow the rows');
    const marks = () =>
      line
        .locator('.wrap-break')
        .evaluateAll((all) =>
          all.map((mark) => mark.getBoundingClientRect().left),
        );
    const before = await marks();
    let after = before;
    for (
      let columns = 8;
      columns <= 16 && isDeepStrictEqual(after, before);
      columns++
    ) {
      await line.evaluate((element, narrower) => {
        const code = element.querySelector<HTMLElement>('.code');
        if (code) {
          code.style.paddingRight = `calc(2 * var(--diff-code-padding) + ${narrower}ch)`;
        }
      }, columns);
      await waitFor(
        () => marksFollowRows(line),
        'the marks to follow the rows broken elsewhere',
      );
      after = await marks();
    }
    assert.notDeepStrictEqual(after, before);
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('makes each line of the diff as tall as the font size of code times the line height set, rounded to whole device pixels, placing the rows and the marks of wrapped ones that far apart, the file header a line tall too', async () => {
    await writeSettings(page, profile, {
      ...baseSettings,
      fonts: { monospaceLineHeight: 2.1 },
    });
    await openChangedFile();
    const rows = await page
      .locator('.diff-view .diff-row')
      .evaluateAll((elements) =>
        elements.flatMap((element) => {
          const shown = element.querySelector('.file-header, .diff-line');
          return shown
            ? [
                {
                  kind: shown.classList.contains('file-header')
                    ? 'file'
                    : 'line',
                  top: element.getBoundingClientRect().top,
                  height: element.getBoundingClientRect().height,
                  shown: shown.getBoundingClientRect().height,
                },
              ]
            : [];
        }),
      );
    const tall = await codeRow(2.1);
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

    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = page
      .locator('.diff-line', { has: page.locator('.wrap-break') })
      .first();
    await line.waitFor();
    const laidOut = () =>
      line.evaluate((element) => {
        const top = element.getBoundingClientRect().top;
        return {
          height: element.getBoundingClientRect().height,
          marks: Array.from(
            element.querySelectorAll('.wrap-break'),
            (mark) => mark.getBoundingClientRect().top - top,
          ),
        };
      });
    await waitFor(async () => {
      const { height, marks } = await laidOut();
      return height > tall && marks.length === Math.round(height / tall) - 1;
    }, 'a mark at the end of every row but the last');
    const { height, marks } = await laidOut();
    assert.deepStrictEqual(
      marks.map((mark, index) => near(mark, index * tall)),
      Array.from({ length: Math.round(height / tall) - 1 }, () => true),
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('scrolls the two sides of a side by side diff together on the sideways scrollbar below either, both showing how far they are scrolled, and takes the two away once the lines are wrapped', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.getByRole('button', { name: 'Side by Side' }).click();
    const bars = '.diff-view .scroll-proxy.horizontal';
    await waitForCount(page.locator(bars), 2, 'sideways scrollbars');
    const thumbBelow = async (side: number) => {
      const { box } = await barOf(page, `${bars} >> nth=${side}`, 'horizontal');
      const { thumb } = await barParts(page, box, 'horizontal');
      assert.ok(thumb, `the scrollbar below side ${side} has no thumb`);
      return { thumb, along: thumb.left - box.left };
    };
    const code = page.locator('.split-row .split-code').nth(1).locator('.code');
    const before = await code.boundingBox();
    assert.ok(before, 'the code has no box');
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
      const after = await code.boundingBox();
      return after !== null && after.x < before.x - 100;
    }, 'the code to scroll sideways');
    let moved = [left.along, right.along];
    await waitFor(async () => {
      moved = [(await thumbBelow(0)).along, (await thumbBelow(1)).along];
      return moved.every(
        (along) =>
          along > left.along + 90 && Math.abs(along - (moved[0] ?? 0)) <= 1,
      );
    }, 'both scrollbars to move along together').catch((error: unknown) => {
      throw new Error(`${String(error)}: ${JSON.stringify(moved)}`);
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
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'spaced.txt' }).click();
    const dots = page
      .locator('.diff-view:not(.wrap) .code > .dot-rows')
      .first();
    await dots.waitFor();
    const code = dots.locator('..');
    const centers = await code.evaluate(spaceCenters);
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
      const row = Math.round(((centers[1]?.x ?? 0) - (centers[0]?.x ?? 0)) / 8);
      return centers.map(
        ({ x, y }) => !at(x, y).equals(at(x, y - Math.max(4, row))),
      );
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
