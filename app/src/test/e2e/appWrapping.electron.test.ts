import * as assert from 'node:assert';
import { isDeepStrictEqual } from 'node:util';
import { suite, test } from 'vitest';
import { wrapColumns, wrappedLines, wrapStarts } from '../../lib/page/wordWrap';
import {
  diffLineNumbered,
  firstLongLine,
  gridLines,
  longLines,
  openChangedFile,
  page,
  savedSetting,
  sharedApp,
  viewSaved,
  wrapsSaved,
} from './appFixtures';
import { waitFor } from '../helpers/fixtures';
import {
  drawnCodeRow,
  near,
  hyphenatedLine,
  dottedLine,
  breakLines,
  longestLine,
  minifiedLine,
  breakCharacters,
  breakContexts,
  breakSentences,
  wrappingInPage,
  browserStarts,
  paddedLine,
  wrappedRows,
  laidOutCode,
  pressWrap,
  clickView,
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

  test('lists the history and shows a commit entire, with its change, inline, then side by side on its button, the default, and inline again on the other, and wraps long lines on its button or W, each row as tall as the lines the app expects its text to wrap to, keeping the line at the top in place as it wraps and changes layout, saving each choice', async () => {
    await openChangedFile();
    assert.deepStrictEqual(
      await page.locator('.diff-row .diff-line .code').allTextContents(),
      ['one', 'two', '2', 'three'],
    );
    await page.locator('.diff-minimap').waitFor();
    await page.getByRole('button', { name: 'Side by Side' }).click();
    const sides = page.locator('.split-line');
    await sides.first().waitFor();
    await page.locator('.diff-view.side-by-side').waitFor();
    assert.deepStrictEqual(
      await sides.evaluateAll((rows) =>
        rows.map((row) =>
          [...row.querySelectorAll('.split-side')]
            .map((side) => side.querySelector('.code')?.textContent ?? '')
            .join(' | '),
        ),
      ),
      ['one | one', 'two | 2', 'three | three'],
    );
    assert.strictEqual(await page.locator('.split-side.removed').count(), 1);
    assert.strictEqual(await page.locator('.split-side.added').count(), 1);
    await waitFor(
      () => savedSetting('diffLayout') === undefined,
      'the layout to be saved',
    );
    await page.getByRole('button', { name: 'Inline' }).click();
    await sides.first().waitFor({ state: 'detached' });
    assert.strictEqual(
      await page.locator('.diff-view.side-by-side').count(),
      0,
    );
    await page.locator('.diff-line.added').first().waitFor();
    await waitFor(
      () => savedSetting('diffLayout') === 'inline',
      'the layout to be saved',
    );

    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    const row = page.locator('.diff-row', {
      has: page.locator('.code', { hasText: firstLongLine }),
    });
    await row.waitFor();
    const lineHeight = await drawnCodeRow();
    const unwrapped = (await row.boundingBox())?.height;
    assert.ok(near(unwrapped, lineHeight), `${unwrapped} is not ${lineHeight}`);
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page.locator('.diff-view.wrap').waitFor();
    await page.waitForFunction(
      ([text, height]) =>
        [...document.querySelectorAll('.diff-row')].some(
          (wrapped) =>
            wrapped.querySelector('.code')?.textContent === text &&
            wrapped.getBoundingClientRect().height > height + 0.5,
        ),
      [firstLongLine, lineHeight] as const,
    );
    const laidOut = await row.evaluate((element) => {
      const code = element.querySelector('.code');
      if (!code) {
        throw new Error('No code');
      }
      const style = getComputedStyle(code);
      const sample = document.createElement('span');
      sample.style.font = style.font;
      sample.style.letterSpacing = style.letterSpacing;
      sample.style.whiteSpace = 'pre';
      sample.textContent = '0'.repeat(100);
      document.body.append(sample);
      const char = sample.getBoundingClientRect().width / 100;
      sample.remove();
      return {
        height: element.getBoundingClientRect().height,
        width:
          code.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        char,
      };
    });
    const wrappedHeight =
      wrappedLines(firstLongLine, wrapColumns(laidOut.width, laidOut.char)) *
      lineHeight;
    assert.ok(
      near(laidOut.height, wrappedHeight),
      `${laidOut.height} is not ${wrappedHeight}`,
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
    const list = page.locator('.diff-view .virtual-rows');
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    const topLine = () =>
      list.evaluate((element) => {
        const top = element.getBoundingClientRect().top + 0.5;
        const atTop = [...element.querySelectorAll('.diff-row')].find(
          (candidate) => {
            const box = candidate.getBoundingClientRect();
            return box.top <= top && box.bottom > top;
          },
        );
        return atTop?.querySelector('.code')?.textContent?.split(' ')[0];
      });
    await waitFor(
      async () => /^line[1-9]\d*$/.test((await topLine()) ?? ''),
      'a line at the top',
    );
    const reading = await topLine();
    for (const [change, shown, state, wraps, layout] of [
      [pressWrap, '.diff-view.wrap', 'detached', false, 'inline'],
      [pressWrap, '.diff-view.wrap', 'attached', true, 'inline'],
      [
        clickView('Side by Side'),
        '.diff-view.side-by-side',
        'attached',
        true,
        'sideBySide',
      ],
      [pressWrap, '.diff-view.wrap', 'detached', false, 'sideBySide'],
      [
        clickView('Inline'),
        '.diff-view.side-by-side',
        'detached',
        false,
        'inline',
      ],
      [pressWrap, '.diff-view.wrap', 'attached', true, 'inline'],
    ] as const) {
      await change();
      await page.locator(shown).waitFor({ state });
      await waitFor(
        async () => (await topLine()) === reading,
        `${reading} to stay at the top once ${shown} is ${state}`,
      );
      await waitFor(
        () => viewSaved(wraps, layout),
        `the choice that ${shown} is ${state} to be saved`,
      );
    }
  });

  test('marks where each wrapped row ends right after its text, where the browser broke it, after punctuation too, rather than where the app estimates', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'hyphenated.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = page
      .locator('.diff-line', { has: page.locator('.wrap-break') })
      .first();
    await line.waitFor();
    await waitFor(
      () => marksFollowRows(line).catch(() => false),
      'the marks to follow the rows',
    );
    const rows = await wrappedRows(line);
    assert.ok(rows.length > 1, `${rows.length} rows`);
    assert.deepStrictEqual(
      rows,
      rows.map(() => ({ last: '-', follows: true })),
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('wraps an indented line where VS Code would, after its punctuation, onto rows indented as far as it, as many as the app estimates, never leaving its indentation on a row of its own', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'wrapped.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = page.locator('.diff-line', { hasText: 'part0.part1.' });
    await line.locator('.wrap-break').first().waitFor();
    const laidOut = () => laidOutCode(line);
    await waitFor(async () => {
      const { rows, marks } = await laidOut();
      return rows.length > 2 && marks.length === rows.length - 1;
    }, 'a mark at the end of every row but the last');
    const { text, rows, marks, width, char } = await laidOut();
    assert.strictEqual(text, dottedLine);
    assert.strictEqual(rows[0].first, ' ');
    assert.deepStrictEqual(
      rows.map((row) => [row.last, Math.abs(row.start - rows[0].start) < 1]),
      rows.map((_, index) => [index < rows.length - 1 ? '.' : ';', true]),
    );
    assert.deepStrictEqual(
      marks.map((mark, index) => Math.abs(mark - rows[index].right) < 1),
      marks.map(() => true),
    );
    assert.strictEqual(
      rows.length,
      wrappedLines(text, wrapColumns(width, char)),
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('finds the same places to break a line as the browser, which asks ICU, the line breaker of Unicode, beyond ASCII and uses a table of its own between two characters of ASCII, comparing every pair of a set of characters after each of a few and sentences of many scripts', async () => {
    const wrapping = await wrappingInPage();
    const texts = [...breakSentences];
    for (const context of breakContexts) {
      for (const first of breakCharacters) {
        for (const second of breakCharacters) {
          texts.push(`${context}${first}${second}a`);
        }
      }
    }

    const differing = await wrapping.evaluate((app, all) => {
      const box = document.createElement('div');
      box.style.cssText =
        'position: absolute; width: 0; white-space: pre-wrap; overflow-wrap: normal; font: 12px monospace; visibility: hidden';
      for (const text of all) {
        const line = document.createElement('div');
        line.textContent = text;
        box.append(line);
      }
      document.body.append(box);
      const range = document.createRange();
      const found: { text: string; app: number[]; browser: number[] }[] = [];
      for (const [index, line] of [...box.children].entries()) {
        const node = line.firstChild;
        const text = all[index];
        if (!(node instanceof Text)) {
          continue;
        }
        const browser: number[] = [];
        let lastTop = Number.NaN;
        for (let at = 0; at < node.length; at++) {
          const unit = node.data.charCodeAt(at);
          if (unit >= 0xdc00 && unit <= 0xdfff) {
            continue;
          }
          range.setStart(node, at);
          range.setEnd(
            node,
            unit >= 0xd800 && unit <= 0xdbff ? at + 2 : at + 1,
          );
          const rect = [...range.getClientRects()].at(-1);
          if (rect === undefined || rect.height === 0) {
            continue;
          }
          if (!(Math.abs(rect.top - lastTop) < rect.height / 2)) {
            if (at > 0) {
              browser.push(at);
            }
            lastTop = rect.top;
          }
        }
        const flags = app.lineBreaks(text);
        const breaks = [...flags.keys()].filter((at) => flags[at] === 1);
        if (breaks.join() !== browser.join()) {
          found.push({ text, app: breaks, browser });
        }
      }
      box.remove();
      return found.slice(0, 20);
    }, texts);

    assert.deepStrictEqual(differing, []);
  });

  test('wraps every line of a diff where the app expects it to, at the breaks the browser finds after hyphens and dashes, at zero-width spaces, soft hyphens and spaces of other widths, around Chinese, emoji and boxes, and at the punctuation of VS Code and tabs, as the viewer wraps lines the same way', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'breaks.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page.locator('.diff-view .virtual-row .wrap-break').first().waitFor();
    const wrapping = await wrappingInPage();
    const found = [];
    for (const [index, line] of breakLines.entries()) {
      const laidOut = await browserStarts(await diffLineNumbered(index + 1));
      const columns = wrapColumns(laidOut.width, laidOut.char);
      found.push({
        line: `${line.slice(0, 24)} ${columns}`,
        browser: laidOut.starts,
        app: await wrapping.evaluate(
          async (app, { text, wrapAt, boxed }) => {
            const widths = app.cellWidthsOf(await app.terminalCells());
            return app.wrapStarts(text, wrapAt, app.wrapIndent(text, wrapAt), {
              ...widths,
              boxed: (cluster) =>
                boxed.includes(cluster) ? widths.of(cluster) : undefined,
            });
          },
          { text: line, wrapAt: columns, boxed: laidOut.boxed },
        ),
      });
    }
    assert.deepStrictEqual(
      found.filter(({ browser, app }) => !isDeepStrictEqual(browser, app)),
      [],
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('marks where each row of a line of over 200 rows ends, where the app expects the browser to break it, as reading where the browser broke it froze the page, drawing the marks near the rows in sight as it scrolls', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'longest.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = await diffLineNumbered(1);
    const marks = line.locator('.wrap-break');
    await marks.first().waitFor();
    const laidOut = await browserStarts(line);
    assert.ok(laidOut.starts.length > 200, String(laidOut.starts.length));
    const offRows = async () => {
      const rowTops = await line.evaluate((element, starts) => {
        const walker = document.createTreeWalker(
          element.querySelector('.code') ?? element,
          NodeFilter.SHOW_TEXT,
        );
        const range = document.createRange();
        const found: number[] = [];
        let offset = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!(node instanceof Text)) {
            continue;
          }
          for (const at of starts) {
            if (at >= offset && at < offset + node.length) {
              range.setStart(node, at - offset);
              range.setEnd(node, at - offset + 1);
              found.push(range.getBoundingClientRect().top);
            }
          }
          offset += node.length;
        }
        return found.slice(0, -1);
      }, laidOut.starts);
      const markTops = await marks.evaluateAll((all) =>
        all.map((mark) => mark.getBoundingClientRect().top),
      );
      return markTops.filter(
        (top) => !rowTops.some((row) => Math.abs(row - top) < 4),
      );
    };
    assert.deepStrictEqual(await offRows(), []);
    const list = page.locator('.diff-view .virtual-rows');
    const half = await line.evaluate(
      (element) => element.getBoundingClientRect().height / 2,
    );
    await list.evaluate((element, by) => {
      element.scrollTop += by;
    }, half);
    await waitFor(async () => {
      const shown = await list.evaluate((element) => {
        const { top, bottom } = element.getBoundingClientRect();
        return { top, bottom };
      });
      const tops = await marks.evaluateAll((all) =>
        all.map((mark) => mark.getBoundingClientRect().top),
      );
      return tops.some((top) => top > shown.top && top < shown.bottom);
    }, 'marks in sight in the middle of the line');
    assert.deepStrictEqual(await offRows(), []);
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('wraps a line longer than 64 KiB only where the browser breaks it, where the app expects it to, keeping its indentation on the row with its code, as the app expected breaks after punctuation it no longer marks in such a line, its marks drifting from the rows, and the browser broke it right after its indentation', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'minified.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = await diffLineNumbered(1);
    await line.locator('.wrap-break').first().waitFor();
    const laidOut = await browserStarts(line);
    assert.strictEqual(laidOut.text, minifiedLine);
    assert.ok(
      laidOut.starts[1] > 4,
      `the first row ends at ${laidOut.starts[1]}`,
    );
    assert.deepStrictEqual(
      laidOut.starts,
      wrapStarts(minifiedLine, wrapColumns(laidOut.width, laidOut.char)),
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });
});
