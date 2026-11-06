import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as esbuild from 'esbuild';
import type { JSHandle, Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import type * as lineBreaksModule from '../ui/lineBreaks';
import type * as textWidthsModule from '../ui/textWidths';
import type * as wordWrapModule from '../ui/wordWrap';
import { wrapColumns, wrappedLines } from '../ui/wordWrap';
import {
  barsOffGrid,
  baseSettings,
  firstLongLine,
  gridLines,
  longLines,
  openChangedFile,
  page,
  profile,
  savedSetting,
  sharedApp,
  viewSaved,
  waitForFocus,
  whitespaceShownSaved,
  wrapsSaved,
} from './appFixtures';
import { waitFor } from './fixtures';

async function drawnCodeRow(): Promise<number> {
  return page
    .locator('.diff-line')
    .first()
    .evaluate((line) => parseFloat(getComputedStyle(line).lineHeight));
}

async function codeRow(lineHeight: number): Promise<number> {
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

const breakLines = [
  '--some-very-long-option-name '.repeat(12),
  'alpha–beta–gamma–delta–epsilon–zeta–eta–theta–iota–kappa '.repeat(6),
  'alpha—beta—gamma—delta—epsilon—zeta—eta—theta—iota—kappa '.repeat(6),
  'release-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-16-17-18-19-20 '.repeat(6),
  ' -flag-one -flag-two -flag-three -flag-four --flag-five'.repeat(7),
  'x-1 a-b c- -d e--f g---h '.repeat(16),
  ' -ab'.repeat(80),
  ' -abc'.repeat(70),
  ' --abc'.repeat(60),
  ' —abc'.repeat(70),
  ' –abc'.repeat(70),
  'ab-12'.repeat(70),
  'ab-cd'.repeat(70),
  '12-34'.repeat(70),
  '12-ab'.repeat(70),
  'ab‐cd'.repeat(70),
  'ab–cd'.repeat(70),
  'ab—cd'.repeat(70),
  'ab–12'.repeat(70),
  'ab—12'.repeat(70),
  'ab--cd'.repeat(60),
  'ab---cd'.repeat(55),
  'ab——cd'.repeat(60),
  'ab-(cd)'.repeat(55),
  'ab-.cd'.repeat(60),
  'ab-"cd"'.repeat(55),
  'ab-\u00e9cd'.repeat(60),
  'ab-中文'.repeat(60),
  'ab\u00adcd'.repeat(70),
  'abcdefghij\u200b'.repeat(30),
  'hyphen\u00adated\u00adwords\u00adwith\u00adsoft\u00adhyphens '.repeat(6),
  'ab\u3000'.repeat(60),
  'abc\u3000'.repeat(50),
  'ab \u3000'.repeat(50),
  'ab\u2003'.repeat(60),
  'abc\u2003'.repeat(50),
  '\u672c\u6587\u306e\u3000\u5168\u89d2\u30b9\u30da\u30fc\u30b9\u3000\u3067\u533a\u5207\u308b\u3000\u6587\u7ae0\u3002\u3000'.repeat(
    8,
  ),
  'https://example.com/some/path/to/a-file.txt?query=value&other=1 '.repeat(6),
  '中文中文、中文。「中文」'.repeat(20),
  '😀 emoji😀word 🎉🎉 '.repeat(20),
  '\tindented\twith\ttabs and words '.repeat(12),
  `    ${'indented line with some words to wrap around the edge '.repeat(6)}`,
  'foo(bar).baz[qux]{quux}+corge;grault|garply/waldo&fred,plugh?xyzzy '.repeat(
    6,
  ),
];

const longestLine = Array.from(
  { length: 4000 },
  (_, index) => `word${index}`,
).join(' ');

const breakCharacters = [
  ...Array.from({ length: 94 }, (_, index) => String.fromCharCode(33 + index)),
  ...Array.from(
    '‐–—―‒−\u00ad\u200b\u00a0\u2011\u202f\u2060\ufeff\u200d\u0301\u2009\u2002\u2003\u205f\t',
  ),
  ...Array.from('éßαя·•…″°€£±×÷§¶©™→∞«»¿¡‘’“”'),
  ...Array.from('中、。「」（）ア한ァー々・！？：，．〜゠'),
  '😀',
  '👍',
  '🇭',
];

const breakContexts = ['a', ' ', '(', '中', 'é'];

const breakSentences = [
  'Árvíztűrő tükörfúrógép — „idézőjel” és ‚másik’ (zárójel) – gondolatjel… vége.',
  'The “quick” brown fox’s jump—over the lazy dog—ended; well… maybe (not).',
  '日本語の文章です。「かぎかっこ」と（丸括弧）、句読点。ーァィゥ々〻！？',
  '本文の　全角スペース　で区切る　文章。　段落',
  '한국어 문장입니다. “따옴표”와 (괄호), 그리고 쉼표!',
  '中文句子，包含标点符号。“引号”和《书名号》！',
  '😀😀 emoji👍🏻 flags 🇭🇺🇺🇸 family 👨‍👩‍👧‍👦 keycap 1️⃣ ⚠️ done',
  'price: €12.50, £3, $4, 50%, 30°C, −5, ±2, 3×4, 6÷2, a→b, ∞',
  'x\u00a0y a\u2011b c\u202fd e\u2060f g\u200bh i\u00adj k\u200dl',
  'https://example.com/ünïcödé/path?q=é&r=中#frag',
  'ab-é é-ab é-1 a-é 1-é (é) [é] {é} é/é é.é é,é é;é é:é é!é é?é é%é',
  'Ελληνικά κείμενο — με παύλες· και «εισαγωγικά».',
  'Русский текст — с тире, «кавычками» и… многоточием.',
  'a‐b–c—d―e−f\tg\th',
];

type PageWrapping = Pick<typeof lineBreaksModule, 'lineBreaks'> &
  Pick<typeof textWidthsModule, 'cellWidthsOf' | 'terminalCells'> &
  Pick<typeof wordWrapModule, 'wrapIndent' | 'wrapStarts'>;

async function wrappingInPage(): Promise<JSHandle<PageWrapping>> {
  const built = await esbuild.build({
    stdin: {
      contents: [
        "export { lineBreaks } from './lineBreaks';",
        "export { cellWidthsOf, terminalCells } from './textWidths';",
        "export { wrapIndent, wrapStarts } from './wordWrap';",
      ].join('\n'),
      resolveDir: path.join(__dirname, '..', 'ui'),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: 'wrappingOfTheApp',
    write: false,
  });
  return page.evaluateHandle<PageWrapping>(
    `${built.outputFiles[0].text};wrappingOfTheApp`,
  );
}

async function diffLineNumbered(number: number): Promise<Locator> {
  const list = page.locator('.diff-view .virtual-rows');
  const line = page.locator('.diff-view .virtual-row .diff-line').filter({
    has: page.locator('.number', { hasText: new RegExp(`^${number}$`) }),
  });
  await waitFor(async () => {
    if ((await line.count()) > 0) {
      return true;
    }
    await list.evaluate((element) => {
      element.scrollTop += element.clientHeight / 2;
    });
    return false;
  }, `line ${number} of the diff`);
  return line.first();
}

function browserStarts(line: Locator) {
  return line.evaluate((element) => {
    const code = element.querySelector<HTMLElement>('.code');
    if (!code) {
      throw new Error('No code');
    }
    const range = document.createRange();
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const starts: number[] = [];
    let lastTop = Number.NaN;
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text)) {
        continue;
      }
      for (let at = 0; at < node.length; at++) {
        const unit = node.data.charCodeAt(at);
        if (unit >= 0xdc00 && unit <= 0xdfff) {
          continue;
        }
        range.setStart(node, at);
        range.setEnd(
          node,
          Math.min(
            node.length,
            unit >= 0xd800 && unit <= 0xdbff ? at + 2 : at + 1,
          ),
        );
        const rect = range.getBoundingClientRect();
        if (
          rect.height > 0 &&
          !(Math.abs(rect.top - lastTop) < rect.height / 2)
        ) {
          starts.push(offset + at);
          lastTop = rect.top;
        }
      }
      offset += node.length;
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
      starts,
      boxed: [...code.querySelectorAll('.cell')].map(
        (cell) => cell.textContent ?? '',
      ),
      width:
        code.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.textIndent),
      char,
    };
  });
}

const firsts = (rows: readonly { first: string }[]) =>
  rows.map((row) => row.first);

const lineHeights = () =>
  page
    .locator('.diff-view .virtual-row .diff-line')
    .evaluateAll((lines) =>
      lines.map(
        (line) => Math.round(line.getBoundingClientRect().height * 10) / 10,
      ),
    );

const paddedLine = `| Feature${' '.repeat(100)}| What it does${' '.repeat(100)}| Notes${' '.repeat(50)}|`;

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

function laidOutCode(line: Locator) {
  return line.evaluate((element) => {
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
    'padded.txt': `${paddedLine}\n`,
    'breaks.txt': `${breakLines.join('\n')}\n`,
    'longest.txt': `${longestLine}\n`,
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
    const hidden = await settled();
    await page
      .getByRole('button', { name: 'Show Whitespace', exact: true })
      .click();
    await page.locator('.diff-view.show-whitespace').waitFor();
    const shown = await settled();
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
      () => wrapsSaved() && whitespaceShownSaved(),
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
    await page
      .getByRole('button', { name: 'Show Whitespace', exact: true })
      .click();
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
