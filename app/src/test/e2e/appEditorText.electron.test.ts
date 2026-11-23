import * as assert from 'node:assert';
import type { JSHandle, Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import type { SeenRow } from '../../components/cells/page/seen';
import { diffLineNumbered, page, sharedApp } from './appFixtures';
import { gridLines } from './gridLines';
import { waitFor } from '../helpers/fixtures';
import { blankSignOf } from '../../lib/page/blankSigns';
import { strings } from '../../lib/shared/strings';
import { wrapIndent, wrapStarts } from '../../lib/page/wordWrap';
import { cellsOf } from './cellsSeen';
import { diffPlaces, diffSides } from './diffSeen';
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

const probeCells = '.editor-probe .editor-cells';

const unwrappedWidth = 3000;

type Places = readonly (readonly [at: number, column: number])[];

interface LineSeen {
  readonly text: string;
  readonly host: string;
  readonly rows: readonly SeenRow[];
  readonly rowAt: readonly number[];
  readonly places: readonly Places[];
}

interface LaidOut {
  readonly text: string;
  readonly lineHeight: number;
  readonly places: readonly (readonly [at: number, x: number, y: number])[];
}

function laidOut({ text, rows, places }: LineSeen): LaidOut {
  const found = rows.flatMap((row, index) =>
    (places[index] ?? []).map(
      ([at, column]) =>
        [
          row.from + at,
          row.left + (column - row.column) * row.advance,
          row.top,
        ] as const,
    ),
  );
  const left = found[0]?.[1] ?? 0;
  const top = found[0]?.[2] ?? 0;
  return {
    text,
    lineHeight: rows[0]?.height ?? 0,
    places: found.map(([at, x, y]) => [at, x - left, y - top]),
  };
}

async function diffLine(
  number: number,
  wrapping: boolean,
): Promise<{ readonly line: LineSeen; readonly width: number }> {
  const { text, rows } = await diffLineNumbered(number);
  const places: Places[] = [];
  for (const row of rows) {
    places.push(await diffPlaces(page, row));
  }
  return {
    line: {
      text,
      host: diffSides,
      rows,
      rowAt: rows.map(({ at }) => at),
      places,
    },
    width: wrapping ? (await wrapColumnsShown()).width : unwrappedWidth,
  };
}

const twoFrames = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

async function editorRows(
  what: string,
  enough: (rows: readonly SeenRow[]) => boolean = (rows) => rows.length > 0,
): Promise<readonly SeenRow[]> {
  let rows: readonly SeenRow[] = [];
  let last = '';
  await waitFor(async () => {
    await twoFrames();
    rows = await cellsOf(page, probeCells).rows();
    const now = JSON.stringify(rows);
    const settled = enough(rows) && now === last;
    last = now;
    return settled;
  }, what);
  return rows;
}

async function editorSeen(): Promise<LineSeen> {
  const rows = await editorRows('the line of the editor to settle');
  return {
    text: rows[0]?.line ?? '',
    host: probeCells,
    rows,
    rowAt: rows.map((_, index) => index),
    places: await page
      .locator(probeCells)
      .evaluate(
        (host, count) =>
          Array.from({ length: count }, (_, row) =>
            host instanceof HTMLElement
              ? [...(host.seenPlaces?.(row) ?? [])]
              : [],
          ),
        rows.length,
      ),
  };
}

async function editorLine(
  editor: JSHandle<PageEditor>,
  text: string,
  width: number,
  wrapping: boolean,
  blanks = false,
): Promise<LineSeen> {
  await mountEditor(editor, text, width, wrapping, blanks);
  return editorSeen();
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

function misplaced(
  number: number,
  diff: LaidOut,
  editor: LaidOut,
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
      !near(edited.get(at)?.[0] ?? NaN, x) ||
      !near(edited.get(at)?.[1] ?? NaN, y),
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
    const { line, width } = await diffLine(number + 1, wrapping);
    const shown = await editorLine(editor, line.text, width, wrapping);
    const wrong = misplaced(number + 1, laidOut(line), laidOut(shown));
    if (wrong !== undefined) {
      found.push(wrong);
    }
  }
  return found;
}

const placed = async (
  glyphs: Promise<readonly { row: number; column: number }[]>,
) => new Set((await glyphs).map(({ row, column }) => `${row}:${column}`));

async function blanksOf({ host, rows, rowAt, places }: LineSeen): Promise<{
  readonly marked: readonly string[];
  readonly seen: number;
}> {
  const cells = cellsOf(page, host);
  const dots = await placed(cells.dots());
  const signs = new Map<string, Set<string>>();
  const marked: string[] = [];
  for (const [index, row] of rows.entries()) {
    for (const [at, column] of places[index] ?? []) {
      const character = row.text[at] ?? '';
      const where = `${rowAt[index]}:${column}`;
      if (character === ' ') {
        if (dots.has(where)) {
          marked.push(`${row.from + at} spaces`);
        }
      } else {
        const sign = blankSignOf(character, true);
        if (sign === undefined) {
          continue;
        }
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

async function openLines(): Promise<Locator> {
  await page.locator('.commit', { hasText: 'first' }).click();
  await page.locator('.row.file', { hasText: 'lines.txt' }).click();
  const list = page.locator('.diff-view .virtual-rows');
  await list.waitFor();
  return list;
}

const textAdvance = () =>
  page.locator('.editor-probe .editor-scroller').evaluate((scroller) => {
    const cell = document.createElement('span');
    cell.style.cssText =
      'display: inline-block; position: absolute; width: var(--text-advance)';
    scroller.append(cell);
    const width = cell.getBoundingClientRect().width;
    cell.remove();
    return width;
  });

suite('App', () => {
  sharedApp({ 'lines.txt': `${editorLines.join('\n')}\n` });

  test('draws every character of a line in the editor in the very column the diff draws it in, on the grid of our terminal, an emoji or a Chinese, Japanese or Korean character two columns and an emoji joined from several one too, with the tabs and spaces as wide, each line as tall', async () => {
    await openLines();

    assert.deepStrictEqual(await misplacedLines(false), []);
  });

  test('wraps every line in the editor exactly where the diff wraps it, at the breaks the browser finds and the punctuation of VS Code, onto rows hanging as far in as its indentation, its runs of spaces hanging at the ends of rows, every character on the very row and in the very column the diff draws it in', async () => {
    await openLines();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page.locator('.diff-view.wrap').waitFor();

    assert.deepStrictEqual(await misplacedLines(true), []);
  });

  test('marks the whitespace in the editor as the diff marks it while it is shown, as it is by default, every space in sight in the diff dotted and every tab and other blank signed like the diff, every character still in the column the diff draws it in', async () => {
    await openLines();
    await waitFor(
      async () => (await cellsOf(page, diffSides).dots()).length > 0,
      'the spaces of the diff dotted',
    );
    const wrapping = (await page.locator('.diff-view.wrap').count()) > 0;
    const editor = await editorInPage();
    const wrong: string[] = [];
    for (const number of editorLines.keys()) {
      const { line, width } = await diffLine(number + 1, wrapping);
      const { marked: inDiff, seen } = await blanksOf(line);
      const shown = await editorLine(editor, line.text, width, wrapping, true);
      const inEditor = (await blanksOf(shown)).marked.filter(
        (mark) => parseInt(mark, 10) < seen,
      );
      const moved = misplaced(number + 1, laidOut(line), laidOut(shown));
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

  test('wraps a tab right after a space hanging at the end of a row onto that row, where the app expects it, whether whitespace is shown or not', async () => {
    const text = '	indented	with	tabs and words 	indented	with	tabs and words ';
    const columns = 38;
    assert.strictEqual(text.indexOf(' 	indented', 1), 29);
    const editor = await editorInPage();
    await mountEditor(editor, text, 400, true);
    const advance = await textAdvance();
    const expected = wrapStarts(text, columns, wrapIndent(text, columns));
    assert.strictEqual(expected[1], 31);
    for (const blanks of [false, true]) {
      const { rows } = await editorLine(
        editor,
        text,
        columns * advance + 0.5,
        true,
        blanks,
      );
      assert.deepStrictEqual(
        rows.map(({ from }) => from),
        expected,
        `whitespace shown: ${blanks}`,
      );
    }
  });

  test('numbers the lines in the editor as the diff numbers them, the number ending and the text starting as far from the left edge of its column, within the half of a device pixel either is put on a whole one by, and as far from each other', async () => {
    await openLines();
    const [first] = (await diffLineNumbered(1)).rows;
    assert.ok(first, 'the first line of the diff has no row');
    const column = (first.numbers ?? []).indexOf('1');
    const numberLeft = await page
      .locator('.diff-view .diff-ruler .number')
      .nth(column)
      .evaluate((number) => number.getBoundingClientRect().left);
    const editor = await editorInPage();
    const {
      rows: [edited],
    } = await editorLine(editor, editorLines[0] ?? '', 800, false);
    assert.ok(edited, 'the first line of the editor has no row');
    const editorLeft = await page
      .locator('.editor-probe .editor-scroller')
      .evaluate((scroller) => scroller.getBoundingClientRect().left);
    const halfPixel = 0.5 / (await page.evaluate(() => devicePixelRatio));
    const inDiff = {
      numberEnds: (first.numberEnds?.[column] ?? NaN) - numberLeft,
      textStarts: first.left - first.column * first.advance - numberLeft,
    };
    const inEditor = {
      numberEnds: (edited.numberEnds?.[0] ?? NaN) - editorLeft,
      textStarts: edited.left - edited.column * edited.advance - editorLeft,
    };
    assert.deepStrictEqual(edited.numbers, ['1']);
    assert.ok(
      Math.abs(inEditor.numberEnds - inDiff.numberEnds) <= halfPixel + 0.01 &&
        Math.abs(inEditor.textStarts - inDiff.textStarts) <= halfPixel + 0.01 &&
        near(
          inEditor.textStarts - inEditor.numberEnds,
          inDiff.textStarts - inDiff.numberEnds,
        ),
      JSON.stringify({ inEditor, inDiff }),
    );
  });

  test('marks the end of every row of a line wrapped in the editor with the sign of a break right after its text, within the two columns kept past the row, as the viewer and the diff mark it, far into a line of thousands of rows too, as it is paged through', async () => {
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
      const editorBox = box.querySelector('.editor-surface');
      if (editorBox instanceof HTMLElement) {
        editorBox.style.height = '100%';
      }
    });
    const columns = Math.floor(600 / (await textAdvance()) + 1e-6);
    for (const head of [60, 60_000, 120_000]) {
      await editor.evaluate((app, at) => {
        const dom = document.querySelector('.editor-probe .editor-surface');
        const view =
          dom instanceof HTMLElement ? app.EditorView.findFromDOM(dom) : null;
        view?.dispatch({ selection: { anchor: at }, scrollIntoView: true });
      }, head);
      const rows = await editorRows(`the rows around ${head}`, (shown) =>
        shown.some(
          ({ from, text }) => from <= head && head < from + text.length,
        ),
      );
      const signs = await placed(
        cellsOf(page, probeCells).glyphs(strings.symbols.breaks),
      );
      const marked = rows.flatMap(({ breakAt }, index) =>
        breakAt === undefined ? [] : [`${index}:${breakAt}`],
      );
      assert.ok(marked.length > 20, `${head}: ${marked.length}`);
      assert.deepStrictEqual(
        {
          unmarked: rows
            .filter(
              ({ continues, breakAt }) => continues && breakAt === undefined,
            )
            .map(({ key }) => key),
          undrawn: marked.filter((mark) => !signs.has(mark)),
          misplaced: rows.flatMap(({ key, text, breakAt, column }) =>
            breakAt === undefined ||
            (breakAt >= column + text.trimEnd().length &&
              breakAt <= columns + 1)
              ? []
              : [`${key} at ${breakAt}`],
          ),
        },
        { unmarked: [], undrawn: [], misplaced: [] },
        String(head),
      );
    }
  });
});
