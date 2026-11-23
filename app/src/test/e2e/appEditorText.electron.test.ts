import * as assert from 'node:assert';
import type { JSHandle, Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import { diffLineNumbered, page, sharedApp } from './appFixtures';
import { gridLines } from './gridLines';
import { waitFor } from '../helpers/fixtures';
import { blankSignOf, signedBlank } from '../../lib/page/blankSigns';
import { wrapIndent, wrapStarts } from '../../lib/page/wordWrap';
import { cellsOf } from './cellsSeen';
import { diffSides, type DiffLineSeen } from './diffSeen';
import { editorInPage, mountEditor, type PageEditor } from './editorProbe';
import { wrapColumnsShown } from './wrappingFixtures';

const editorLines = [
  `    ${'indented line with some words to wrap around the edge '.repeat(6)}`,
  `        ${Array.from({ length: 60 }, (_, index) => `part${index}`).join('.')};`,
  'foo(bar).baz[qux]{quux}+corge;grault|garply/waldo&fred,plugh?xyzzy '.repeat(
    6,
  ),
  '\tindented\twith\ttabs and words '.repeat(12),
  `\t\t${'tabbed and indented '.repeat(20)}`,
  '--some-very-long-option-name '.repeat(12),
  'alpha–beta—gamma-delta ab­cd abcdefghij​ '.repeat(8),
  'https://example.com/some/path/to/a-file.txt?query=value&other=1 '.repeat(6),
  '中文中文、中文。「中文」'.repeat(20),
  '本文の　全角スペース　で区切る　文章。　'.repeat(8),
  '😀 emoji😀word 🎉🎉 '.repeat(20),
  '👨‍👩‍👧‍👦 family 🇭🇺🇺🇸 flags 1️⃣ ⚠️ keycap 👍🏻 '.repeat(8),
  'Árvíztűrő tükörfúrógép — „idézőjel” és ‚másik’ (zárójel) – gondolatjel… '.repeat(
    4,
  ),
  `| Feature${' '.repeat(100)}| What it does${' '.repeat(100)}| Notes${' '.repeat(50)}|`,
  `trailing${' '.repeat(300)}end`,
  ...gridLines,
];

interface LaidOut {
  readonly text: string;
  readonly lineHeight: number;
  readonly places: readonly (readonly [at: number, x: number, y: number])[];
}

function laidOutText(element: Element): LaidOut {
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const found: [number, number, number][] = [];
  let text = '';
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
      found.push([text.length + at, rect.left, rect.top]);
    }
    text += node.data;
  }
  const origin = found.at(0);
  const left = origin?.[1] ?? 0;
  const top = origin?.[2] ?? 0;
  return {
    text,
    lineHeight: parseFloat(getComputedStyle(element).lineHeight),
    places: found.map(([at, x, y]) => [at, x - left, y - top]),
  };
}

const unwrappedWidth = 100_000;

function laidOutCells({ text, rows }: DiffLineSeen): LaidOut {
  const places = rows.flatMap((row) =>
    row.places.map(
      ([at, column]) =>
        [
          row.from + at,
          row.left + (column - row.column) * row.advance,
          row.top,
        ] as const,
    ),
  );
  const left = places[0]?.[1] ?? 0;
  const top = places[0]?.[2] ?? 0;
  return {
    text,
    lineHeight: rows[0]?.height ?? 0,
    places: places.map(([at, x, y]) => [at, x - left, y - top]),
  };
}

const advanceOf = ({ rows }: DiffLineSeen) => rows[0]?.advance ?? 0;

async function diffLine(
  number: number,
  wrapping: boolean,
): Promise<{
  readonly line: DiffLineSeen;
  readonly laidOut: LaidOut;
  readonly width: number;
}> {
  const line = await diffLineNumbered(number);
  return {
    line,
    laidOut: laidOutCells(line),
    width: wrapping ? (await wrapColumnsShown()).width : unwrappedWidth,
  };
}

const sameLaidOut = (a: LaidOut, b: LaidOut) =>
  a.text === b.text &&
  a.places.length === b.places.length &&
  a.places.every(
    ([at, x, y], index) =>
      b.places[index][0] === at &&
      b.places[index][1] === x &&
      b.places[index][2] === y,
  );

async function editorLine(
  editor: JSHandle<PageEditor>,
  text: string,
  width: number,
  wrapping: boolean,
  blanks = false,
): Promise<LaidOut> {
  await mountEditor(editor, text, width, wrapping, blanks);
  const line = page.locator('.editor-probe .cm-line');
  let last: LaidOut | undefined;
  await waitFor(async () => {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const now = await line.evaluate(laidOutText);
    const settled = last !== undefined && sameLaidOut(last, now);
    last = now;
    return settled;
  }, 'the line of the editor to settle');
  return last ?? (await line.evaluate(laidOutText));
}

interface Misplaced {
  readonly line: number;
  readonly text: string;
  readonly at?: number;
  readonly character?: string;
  readonly diff?: readonly [number, number];
  readonly editor?: readonly [number, number];
  readonly lineHeights?: readonly [number, number];
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

const inColumn = (x: number, grid: number, advance: number) =>
  Math.abs(x - grid) <= advance / 2 + 0.01;

const onRow = (y: number, grid: number, height: number) =>
  Math.round(y / height) === Math.round(grid / height);

function misplaced(
  number: number,
  diff: LaidOut,
  editor: LaidOut,
  advance: number,
): Misplaced | undefined {
  const text = diff.text.slice(0, 40);
  if (diff.text !== editor.text) {
    return { line: number, text: `${text} ≠ ${editor.text.slice(0, 40)}` };
  }
  if (!near(diff.lineHeight, editor.lineHeight)) {
    return {
      line: number,
      text,
      lineHeights: [diff.lineHeight, editor.lineHeight],
    };
  }
  const edited = new Map(
    editor.places.map(([at, x, y]) => [at, [x, y] as const]),
  );
  const index = diff.places.findIndex(
    ([at, x, y]) =>
      !inColumn(edited.get(at)?.[0] ?? NaN, x, advance) ||
      !onRow(edited.get(at)?.[1] ?? NaN, y, diff.lineHeight),
  );
  if (index === -1) {
    return undefined;
  }
  const [at, x, y] = diff.places[index];
  const place = edited.get(at);
  return {
    line: number,
    text,
    at,
    character: diff.text.slice(at, at + 2),
    diff: [x, y],
    editor: [place?.[0] ?? NaN, place?.[1] ?? NaN],
  };
}

async function misplacedLines(wrapping: boolean): Promise<Misplaced[]> {
  const editor = await editorInPage();
  const found: Misplaced[] = [];
  for (const number of editorLines.keys()) {
    const { line, laidOut, width } = await diffLine(number + 1, wrapping);
    const shown = await editorLine(editor, laidOut.text, width, wrapping);
    const wrong = misplaced(number + 1, laidOut, shown, advanceOf(line));
    if (wrong !== undefined) {
      found.push(wrong);
    }
  }
  return found;
}

const placed = async (
  glyphs: Promise<readonly { row: number; column: number }[]>,
) => new Set((await glyphs).map(({ row, column }) => `${row}:${column}`));

async function blanksOf({ rows }: DiffLineSeen): Promise<{
  readonly marked: readonly string[];
  readonly seen: number;
}> {
  const cells = cellsOf(page, diffSides);
  const dots = await placed(cells.dots());
  const signs = new Map<string, Set<string>>();
  const marked: string[] = [];
  for (const row of rows) {
    for (const [at, column] of row.places) {
      const character = row.text[at] ?? '';
      const where = `${row.at}:${column}`;
      if (character === ' ') {
        if (dots.has(where)) {
          marked.push(`${row.from + at} spaces`);
        }
      } else if (signedBlank.test(character)) {
        const sign = blankSignOf(character);
        if (!signs.has(sign)) {
          signs.set(sign, await placed(cells.glyphs(sign)));
        }
        if (signs.get(sign)?.has(where) === true) {
          marked.push(`${row.from + at} ${sign}`);
        }
      }
    }
  }
  const last = rows.at(-1);
  return {
    marked,
    seen: last === undefined ? 0 : last.from + last.text.length,
  };
}

function editorBlanksOf(element: Element): readonly string[] {
  const svg = element.closest('.cm-editor')?.querySelector('.space-dots svg');
  const origin = svg?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const dots = [...(svg?.querySelectorAll('path') ?? [])].flatMap((path) => {
    const pattern = svg?.querySelector(
      (path.getAttribute('fill') ?? '').slice(4, -1) || 'pattern',
    );
    const stripe = pattern?.querySelector('rect');
    const advance = Number(pattern?.getAttribute('width'));
    const phase = Number(
      /translate\((-?[\d.]+)/.exec(
        pattern?.getAttribute('patternTransform') ?? '',
      )?.[1],
    );
    const start = Number(stripe?.getAttribute('x'));
    const dot = Number(stripe?.getAttribute('width'));
    return [
      ...(path.getAttribute('d') ?? '').matchAll(
        /M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)/g,
      ),
    ].flatMap(([, x, y, wide, tall]) => {
      const first = Math.ceil((Number(x) - phase - start) / advance - 0.001);
      return Array.from(
        { length: Math.round(Number(wide) / advance) },
        (_, index) => ({
          x: origin.left + phase + start + (first + index) * advance + dot / 2,
          y: origin.top + Number(y) + Number(tall) / 2,
        }),
      );
    });
  });
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const marked: string[] = [];
  let at = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const mark = node.parentElement?.closest('.blank');
    const length = node.textContent?.length ?? 0;
    for (let index = 0; index < length; index++) {
      if (mark !== null && mark !== undefined && element.contains(mark)) {
        marked.push(
          `${at + index} ${mark.getAttribute('data-glyph') ?? ''} ${mark.className}`,
        );
        continue;
      }
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getBoundingClientRect();
      if (
        dots.some(
          (dot) =>
            dot.x >= rect.left &&
            dot.x < rect.right &&
            dot.y >= rect.top &&
            dot.y < rect.bottom,
        )
      ) {
        marked.push(`${at + index} spaces`);
      }
    }
    at += length;
  }
  return marked;
}

interface RowMarks {
  readonly marks: number;
  readonly misplaced: readonly string[];
}

function rowMarksIn(root: Element): RowMarks {
  const content = root.querySelector('.cm-content');
  if (content === null) {
    throw new Error('No editor');
  }
  const style = getComputedStyle(content);
  const box = content.getBoundingClientRect();
  const rowHeight = parseFloat(style.lineHeight);
  const cell = document.createElement('span');
  cell.style.cssText =
    'display: inline-block; position: absolute; width: var(--text-advance)';
  root.querySelector('.cm-scroller')?.append(cell);
  const advance = cell.getBoundingClientRect().width;
  cell.remove();
  const textLeft = box.left + parseFloat(style.paddingLeft);
  const columns = Math.floor(
    (box.right - parseFloat(style.paddingRight) - textLeft) / advance + 1e-6,
  );
  const kept = textLeft + (columns + 2) * advance;
  const ends = new Map<number, number>();
  const range = document.createRange();
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) {
      continue;
    }
    for (let at = 0; at < node.length; at++) {
      if (node.data[at] === ' ') {
        continue;
      }
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const rect = range.getBoundingClientRect();
      const top = Math.round(rect.top * 10) / 10;
      ends.set(top, Math.max(ends.get(top) ?? -Infinity, rect.right));
    }
  }
  const endOnRowOf = (mark: DOMRect) =>
    [...ends].find(
      ([top]) => top >= mark.top - 0.5 && top < mark.top + rowHeight / 2,
    )?.[1];
  const marks = [...root.querySelectorAll('.wrap-break')].map((mark) =>
    mark.getBoundingClientRect(),
  );
  return {
    marks: marks.length,
    misplaced: marks.flatMap((mark) => {
      const end = endOnRowOf(mark);
      return end !== undefined &&
        mark.left >= end - 0.5 &&
        mark.right <= kept + 0.5
        ? []
        : [`${mark.left} ${mark.top} after ${end} within ${kept}`];
    }),
  };
}

interface Numbered {
  readonly numberEnds: number;
  readonly textStarts: number;
  readonly numberDrop: number;
  readonly color: string;
  readonly font: string;
}

function numberedIn(
  root: Element,
  parts: {
    readonly column: string | null;
    readonly number: string;
    readonly text: string;
  },
): Numbered {
  const number = Array.from(root.querySelectorAll(parts.number)).find(
    (each) =>
      each.textContent?.trim() === '1' &&
      getComputedStyle(each).visibility !== 'hidden',
  );
  const column =
    parts.column === null ? number : root.querySelector(parts.column);
  const text = root.querySelector(parts.text);
  if (number === undefined || column === null || column === undefined) {
    throw new Error('No number for the line');
  }
  if (text === null) {
    throw new Error('No text for the line');
  }
  const first = document
    .createTreeWalker(text, NodeFilter.SHOW_TEXT)
    .nextNode();
  const range = document.createRange();
  if (first !== null) {
    range.setStart(first, 0);
    range.setEnd(first, Math.min(1, first.textContent?.length ?? 0));
  }
  const firstRect = range.getBoundingClientRect();
  range.selectNodeContents(number);
  const numberRect = range.getBoundingClientRect();
  const left = column.getBoundingClientRect().left;
  const style = getComputedStyle(number);
  return {
    numberEnds: Math.round((numberRect.right - left) * 100) / 100,
    textStarts: Math.round((firstRect.left - left) * 100) / 100,
    numberDrop: Math.round((numberRect.top - firstRect.top) * 100) / 100,
    color: style.color,
    font: `${style.fontFamily} ${style.fontSize} ${style.lineHeight} ${style.letterSpacing}`,
  };
}

async function openLines(): Promise<Locator> {
  await page.locator('.commit', { hasText: 'first' }).click();
  await page.locator('.row.file', { hasText: 'lines.txt' }).click();
  const list = page.locator('.diff-view .virtual-rows');
  await list.waitFor();
  return list;
}

suite('App', () => {
  sharedApp({ 'lines.txt': `${editorLines.join('\n')}\n` });

  test('draws every character of a line in the editor in the column the diff draws it in, on the grid of our terminal, an emoji or a Chinese, Japanese or Korean character two columns and an emoji joined from several one too, with the tabs and spaces as wide, each line as tall', async () => {
    await openLines();

    assert.deepStrictEqual(await misplacedLines(false), []);
  });

  test('wraps every line in the editor exactly where the diff wraps it, at the breaks the browser finds and the punctuation of VS Code, onto rows hanging as far in as its indentation, its runs of spaces hanging at the ends of rows, every character on the row and in the column the diff draws it in', async () => {
    await openLines();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page.locator('.diff-view.wrap').waitFor();

    assert.deepStrictEqual(await misplacedLines(true), []);
  });

  test('marks the whitespace in the editor as the diff marks it while it is shown, as it is by default, every space in sight in the diff dotted and every tab and other blank signed in a box like the diff, every character still in the column the diff draws it in', async () => {
    await openLines();
    await waitFor(
      async () => (await cellsOf(page, diffSides).dots()).length > 0,
      'the spaces of the diff dotted',
    );
    const wrapping = (await page.locator('.diff-view.wrap').count()) > 0;
    const editor = await editorInPage();
    const wrong: string[] = [];
    for (const number of editorLines.keys()) {
      const { line, laidOut, width } = await diffLine(number + 1, wrapping);
      const { marked: inDiff, seen } = await blanksOf(line);
      const shown = await editorLine(
        editor,
        laidOut.text,
        width,
        wrapping,
        true,
      );
      const inEditor = (
        await page.locator('.editor-probe .cm-line').evaluate(editorBlanksOf)
      )
        .filter((mark) => parseInt(mark, 10) < seen)
        .map((mark) => mark.split(' ').slice(0, 2).join(' '));
      const moved = misplaced(number + 1, laidOut, shown, advanceOf(line));
      if (moved !== undefined) {
        wrong.push(JSON.stringify(moved));
      }
      const unlike = inDiff.findIndex(
        (mark, index) => inEditor[index] !== mark,
      );
      if (unlike !== -1 || inDiff.length !== inEditor.length) {
        wrong.push(
          `${number + 1}: ${inDiff[unlike] ?? 'end'} ≠ ${inEditor[unlike] ?? inEditor.at(inDiff.length) ?? 'end'}`,
        );
      }
    }
    assert.deepStrictEqual(wrong, []);
  });

  test('wraps a tab right after a space hanging at the end of a row onto that row, where the app expects it, whether whitespace is shown or not, as the sign drawn before the tab carried it onto the next row, unlike a tab drawn plain', async () => {
    const text = '	indented	with	tabs and words 	indented	with	tabs and words ';
    const columns = 38;
    assert.strictEqual(text.indexOf(' 	indented', 1), 29);
    const editor = await editorInPage();
    await mountEditor(editor, text, 400, true);
    const advance = await page
      .locator('.editor-probe .cm-scroller')
      .evaluate((scroller) => {
        const cell = document.createElement('span');
        cell.style.cssText =
          'display: inline-block; position: absolute; width: var(--text-advance)';
        scroller.append(cell);
        const width = cell.getBoundingClientRect().width;
        cell.remove();
        return width;
      });
    const expected = wrapStarts(text, columns, wrapIndent(text, columns));
    assert.strictEqual(expected[1], 31);
    for (const blanks of [false, true]) {
      const { places } = await editorLine(
        editor,
        text,
        columns * advance + 0.5,
        true,
        blanks,
      );
      const starts = places.flatMap(([at, , y], index) =>
        index === 0 || y !== places[index - 1][2] ? [at] : [],
      );
      assert.deepStrictEqual(starts, expected, `whitespace shown: ${blanks}`);
    }
  });

  test('numbers the lines in the editor as the diff numbers them, in the same color and font, the number ending and the text starting as far from the left edge', async () => {
    await openLines();
    const [first] = (await diffLineNumbered(1)).rows;
    assert.ok(first, 'the first line of the diff has no row');
    const column = (first.numbers ?? []).indexOf('1');
    const numbered = await page
      .locator('.diff-view .diff-ruler .number')
      .nth(column)
      .evaluate((number) => {
        const style = getComputedStyle(number);
        return {
          left: number.getBoundingClientRect().left,
          color: style.color,
          font: `${style.fontFamily} ${style.fontSize} ${style.lineHeight} ${style.letterSpacing}`,
        };
      });
    const inDiff = {
      numberEnds:
        Math.round(
          ((first.numberEnds?.[column] ?? NaN) - numbered.left) * 100,
        ) / 100,
      textStarts:
        Math.round(
          (first.left - first.column * first.advance - numbered.left) * 100,
        ) / 100,
      numberDrop: 0,
      color: numbered.color,
      font: numbered.font,
    };
    const editor = await editorInPage();
    await mountEditor(editor, editorLines[0] ?? '', 800, false, false, true);
    const inEditor = await page
      .locator('.editor-probe .cm-editor')
      .evaluate(numberedIn, {
        column: '.cm-gutters',
        number: '.cm-lineNumbers .cm-gutterElement',
        text: '.cm-line',
      });
    assert.deepStrictEqual(inEditor, inDiff);
  });
  test('marks the end of every row of a line wrapped in the editor with the sign of a break right after its text, within the two columns kept past the row, as the viewer and the diff mark it, in a line too long for the editor to draw whole too, as it is paged through', async () => {
    const editor = await editorInPage();
    const long = Array.from(
      { length: 2000 },
      (_, index) =>
        `{"row":${index},"words":"a sentence of some words, with commas and dots."},`,
    ).join('');
    await mountEditor(editor, long, 600, true);
    const probe = page.locator('.editor-probe');
    await probe.evaluate((box) => {
      if (box instanceof HTMLElement) {
        box.style.height = '300px';
      }
      const editorBox = box.querySelector('.cm-editor');
      if (editorBox instanceof HTMLElement) {
        editorBox.style.height = '100%';
      }
    });
    for (const head of [60, 60_000, 120_000]) {
      await editor.evaluate((app, at) => {
        const dom = document.querySelector('.editor-probe .cm-editor');
        const view =
          dom instanceof HTMLElement ? app.EditorView.findFromDOM(dom) : null;
        view?.dispatch({ selection: { anchor: at }, scrollIntoView: true });
      }, head);
      let last = '';
      let found: RowMarks | undefined;
      await waitFor(async () => {
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        found = await probe.evaluate(rowMarksIn);
        const now = JSON.stringify(found);
        const settled = now === last && found.marks > 0;
        last = now;
        return settled;
      }, `the marks of the rows around ${head}`);
      assert.ok((found?.marks ?? 0) > 20, `${head}: ${found?.marks}`);
      assert.deepStrictEqual(found?.misplaced, [], String(head));
    }
  });
});
