import * as assert from 'node:assert';
import type { JSHandle, Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import { diffLineNumbered, page, sharedApp } from './appFixtures';
import { gridLines } from './gridLines';
import { waitFor } from '../helpers/fixtures';
import { editorInPage, mountEditor, type PageEditor } from './editorProbe';

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

async function diffLine(number: number): Promise<{
  readonly laidOut: LaidOut;
  readonly width: number;
}> {
  const code = (await diffLineNumbered(number)).locator('.code');
  return {
    laidOut: await code.evaluate(laidOutText),
    width: await code.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        element.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.textIndent)
      );
    }),
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
  const index = diff.places.findIndex(
    ([, x, y], at) =>
      !near(x, editor.places[at]?.[1] ?? NaN) ||
      !near(y, editor.places[at]?.[2] ?? NaN),
  );
  if (index === -1) {
    return undefined;
  }
  const [at, x, y] = diff.places[index];
  const place = editor.places.at(index);
  return {
    line: number,
    text,
    at,
    character: diff.text.slice(at, at + 2),
    diff: [x, y],
    editor: [place?.[1] ?? NaN, place?.[2] ?? NaN],
  };
}

async function misplacedLines(wrapping: boolean): Promise<Misplaced[]> {
  const editor = await editorInPage();
  const found: Misplaced[] = [];
  for (const number of editorLines.keys()) {
    const { laidOut, width } = await diffLine(number + 1);
    const shown = await editorLine(editor, laidOut.text, width, wrapping);
    const wrong = misplaced(number + 1, laidOut, shown);
    if (wrong !== undefined) {
      found.push(wrong);
    }
  }
  return found;
}

function blanksOf(element: Element): readonly string[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const marked: string[] = [];
  let at = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const mark = node.parentElement?.closest('.blank, .spaces');
    if (mark !== null && mark !== undefined && element.contains(mark)) {
      const kind = mark.classList.contains('spaces')
        ? 'spaces'
        : `${mark.getAttribute('data-glyph') ?? ''} ${mark.className}`;
      for (let index = 0; index < (node.textContent?.length ?? 0); index++) {
        marked.push(`${at + index} ${kind}`);
      }
    }
    at += node.textContent?.length ?? 0;
  }
  return marked;
}

function editorBlanksOf(element: Element): readonly string[] {
  const svg = element.closest('.cm-editor')?.querySelector('.space-dots svg');
  const origin = svg?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const dots = [
    ...(svg?.querySelector('path')?.getAttribute('d') ?? '').matchAll(
      /M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)/g,
    ),
  ].map(([, x, y, size]) => ({
    x: origin.left + Number(x) + Number(size) / 2,
    y: origin.top + Number(y) + Number(size) / 2,
  }));
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

  test('draws every character of a line in the editor exactly where the diff draws it, on the grid of our terminal, an emoji or a Chinese, Japanese or Korean character two columns and an emoji joined from several one too, with the tabs and spaces as wide, each line as tall', async () => {
    await openLines();

    assert.deepStrictEqual(await misplacedLines(false), []);
  });

  test('wraps every line in the editor exactly where the diff wraps it, at the breaks the browser finds and the punctuation of VS Code, onto rows hanging as far in as its indentation, its runs of spaces hanging at the ends of rows, every character where the diff draws it', async () => {
    await openLines();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page.locator('.diff-view.wrap').waitFor();

    assert.deepStrictEqual(await misplacedLines(true), []);
  });

  test('marks the whitespace in the editor as the diff marks it while it is shown, as it is by default, every space dotted and every tab and other blank signed in a box like the diff, every character still where the diff draws it', async () => {
    await openLines();
    await page.locator('.diff-view .spaces').first().waitFor();
    const wrapping = (await page.locator('.diff-view.wrap').count()) > 0;
    const editor = await editorInPage();
    const wrong: string[] = [];
    for (const number of editorLines.keys()) {
      const code = (await diffLineNumbered(number + 1)).locator('.code');
      const { laidOut, width } = await diffLine(number + 1);
      const inDiff = await code.evaluate(blanksOf);
      const shown = await editorLine(
        editor,
        laidOut.text,
        width,
        wrapping,
        true,
      );
      const inEditor = await page
        .locator('.editor-probe .cm-line')
        .evaluate(editorBlanksOf);
      const moved = misplaced(number + 1, laidOut, shown);
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

  test('numbers the lines in the editor as the diff numbers them, in the same color and font, the number ending and the text starting as far from the left edge', async () => {
    await openLines();
    const inDiff = await (
      await diffLineNumbered(1)
    ).evaluate(numberedIn, { column: null, number: '.number', text: '.code' });
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
});
