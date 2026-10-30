import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import { wrapColumns, wrappedLines } from '../ui/wordWrap';
import {
  baseSettings,
  firstLongLine,
  longLines,
  openChangedFile,
  page,
  profile,
  savedSetting,
  sharedApp,
  viewSaved,
  wrapsSaved,
} from './appFixtures';
import { waitFor } from './fixtures';

async function codeRow(lineHeight = 1.4): Promise<number> {
  const ratio = await page.evaluate(() => devicePixelRatio);
  return Math.round(12 * lineHeight * ratio) / ratio;
}

function near(actual: number | undefined, expected: number): boolean {
  return actual !== undefined && Math.abs(actual - expected) < 0.01;
}

const hyphenatedLine = Array.from(
  { length: 60 },
  (_, index) => `part${index}`,
).join('-');
const dottedLine = `        ${Array.from(
  { length: 60 },
  (_, index) => `part${index}`,
).join('.')};`;

function wrappedRows(
  line: Locator,
): Promise<{ last: string; follows: boolean }[]> {
  return line.evaluate((element) => {
    const code = element.querySelector('.code');
    if (!code) {
      throw new Error('No code');
    }
    const text = code.textContent ?? '';
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!(node instanceof Text) || node.length !== text.length) {
      throw new Error('Not one text node');
    }
    const range = document.createRange();
    const ends = new Map<number, { right: number; last: string }>();
    for (let offset = 0; offset < text.length; offset++) {
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getBoundingClientRect();
      ends.set(Math.round(rect.top), {
        right: rect.right,
        last: text[offset],
      });
    }
    const marks = Array.from(
      element.querySelectorAll('.wrap-break'),
      (mark) => mark.getBoundingClientRect().left,
    );
    return [...ends.values()].slice(0, -1).map(({ right, last }, index) => ({
      last,
      follows: Math.abs((marks[index] ?? Infinity) - right) < 1,
    }));
  });
}

const pressWrap = () => page.keyboard.press('w');

const clickView = (name: string) => () =>
  page.getByRole('button', { name }).click();

async function marksFollowRows(line: Locator): Promise<boolean> {
  const rows = await wrappedRows(line);
  return (
    rows.length > 1 && rows.every((row) => row.last === '-' && row.follows)
  );
}

suite('App', () => {
  sharedApp({
    'long.txt': `${longLines.join('\n')}\n`,
    'hyphenated.txt': `${hyphenatedLine}\n`,
    'wrapped.txt': `${dottedLine}\n`,
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
    const lineHeight = await codeRow();
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
    const laidOut = () =>
      line.evaluate((element) => {
        const code = element.querySelector<HTMLElement>('.code');
        if (!code) {
          throw new Error('No code');
        }
        const rows = new Map<
          number,
          { first: string; start: number; last: string; right: number }
        >();
        const range = document.createRange();
        const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!(node instanceof Text)) {
            continue;
          }
          for (let offset = 0; offset < node.length; offset++) {
            range.setStart(node, offset);
            range.setEnd(node, offset + 1);
            const rect = range.getBoundingClientRect();
            const character = node.data[offset];
            const top = Math.round(rect.top);
            const row = rows.get(top) ?? {
              first: character,
              start: NaN,
              last: character,
              right: rect.right,
            };
            if (Number.isNaN(row.start) && character !== ' ') {
              row.start = rect.left;
            }
            rows.set(top, { ...row, last: character, right: rect.right });
          }
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
          text: code.textContent ?? '',
          rows: [...rows.values()],
          marks: Array.from(
            element.querySelectorAll('.wrap-break'),
            (mark) => mark.getBoundingClientRect().left,
          ),
          width:
            code.getBoundingClientRect().width -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight) -
            parseFloat(style.textIndent),
          char,
        };
      });
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

  test('makes each line of the diff as tall as the font size of code times the line height set, rounded to whole device pixels, placing the rows and the marks of wrapped ones that far apart, keeping the file header as tall', async () => {
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
        near(height, kind === 'file' ? 22 : tall),
        near(shown, kind === 'file' ? 22 : tall),
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
      rows
        .slice(1)
        .map((row, index) =>
          near(row.top - rows[index].top, index ? tall : 22),
        ),
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
