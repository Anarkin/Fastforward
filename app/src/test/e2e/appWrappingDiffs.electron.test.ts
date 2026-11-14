import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { wrapColumns, wrappedLines } from '../../lib/page/wordWrap';
import {
  barsOffGrid,
  baseSettings,
  gridLines,
  longLines,
  openChangedFile,
  page,
  profile,
  savedSetting,
  sharedApp,
  waitForFocus,
  whitespaceShownSaved,
  wrapsSaved,
} from './appFixtures';
import { waitFor } from '../helpers/fixtures';
import {
  codeRow,
  near,
  hyphenatedLine,
  dottedLine,
  breakLines,
  longestLine,
  minifiedLine,
  firsts,
  lineHeights,
  paddedLine,
  laidOutCode,
  matchInView,
  marksFollowRows,
} from './wrappingFixtures';

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
  });

  test('scrolls a wrapped diff to each match found in a line wrapped onto more rows than the view holds, rather than to the middle of the line, as stepping between the matches of such a line left them out of view', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'longest.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page.locator('.diff-view .virtual-row .wrap-break').first().waitFor();
    await page.locator('.diff-view .virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page.locator('.find-field-input');
    await waitForFocus(field, 'the find field');
    await field.fill('999');
    for (const match of [1, 2, 3, 4]) {
      if (match > 1) {
        await field.press('Enter');
      }
      await page
        .locator('.find-field-count', { hasText: `${match} of 4` })
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

  test('draws the lines of a diff on the grid of our terminal, an emoji or a Chinese, Japanese or Korean character two columns, an emoji joined from several one too, so text padded for a terminal lines up, each line a row tall when wrapped too, as a shrunk emoji made its line two, colored by its syntax, with whitespace shown, and while a match found ends inside a character of several code points', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'grid.js' }).click();
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
    const field = page.locator('.find-field-input');
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
    const before = await line
      .locator('.wrap-break')
      .evaluateAll((marks) =>
        marks.map((mark) => mark.getBoundingClientRect().left),
      );
    await line.evaluate((element) => {
      const code = element.querySelector<HTMLElement>('.code');
      if (code) {
        code.style.paddingRight = 'calc(2 * var(--diff-code-padding) + 9ch)';
      }
    });
    await waitFor(
      () => marksFollowRows(line),
      'the marks to follow the rows broken elsewhere',
    );
    assert.notDeepStrictEqual(
      await line
        .locator('.wrap-break')
        .evaluateAll((marks) =>
          marks.map((mark) => mark.getBoundingClientRect().left),
        ),
      before,
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('makes each line of the diff as tall as the font size of code times the line height set, rounded to whole device pixels, placing the rows and the marks of wrapped ones that far apart, the file header a line tall too', async () => {
    const reloaded = page.waitForEvent('load');
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ ...baseSettings, fonts: { monospaceLineHeight: 2.1 } }),
    );
    await reloaded;
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

  test('scrolls the two sides of a side by side diff together on a sideways scrollbar, shown while a line is too wide', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.getByRole('button', { name: 'Side by Side' }).click();
    const code = page.locator('.split-row .split-code').nth(1);
    await code.hover();
    const bar = page.locator('.overlay-scrollbar.horizontal.shown');
    await bar.waitFor();
    const before = await code.locator('.code').boundingBox();
    const thumb = await bar.boundingBox();
    assert.ok(before && thumb, 'the code or the scrollbar has no box');
    await page.mouse.move(thumb.x + 5, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(thumb.x + 105, thumb.y + thumb.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    await waitFor(async () => {
      const after = await code.locator('.code').boundingBox();
      return after !== null && after.x < before.x - 100;
    }, 'the code to scroll sideways');
    await waitFor(async () => {
      const moved = await bar.boundingBox();
      return moved !== null && moved.x > thumb.x + 90;
    }, 'the scrollbar to move along');

    await page.keyboard.press('w');
    await page.locator('.diff-view.wrap').waitFor();
    await page.mouse.move(0, 0);
    await code.hover();
    await page.waitForTimeout(100);
    assert.strictEqual(await bar.count(), 0);
    await page.getByRole('button', { name: 'Inline' }).click();
    await waitFor(
      () => wrapsSaved() && savedSetting('diffLayout') === 'inline',
      'the last choices to be saved',
    );
  });
});
