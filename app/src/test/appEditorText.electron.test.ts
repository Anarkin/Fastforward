import * as assert from 'node:assert';
import * as path from 'node:path';
import type * as viewModule from '@codemirror/view';
import * as esbuild from 'esbuild';
import type { JSHandle, Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import type * as commanderKeymapModule from '../tools/commander/shared/keymap';
import type * as editorSelectionModule from '../ui/editorSelection';
import type * as editorTextModule from '../ui/editorText';
import type * as textWidthsModule from '../ui/textWidths';
import { diffLineNumbered, gridLines, page, sharedApp } from './appFixtures';
import { waitFor } from './fixtures';

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

type PageEditor = Pick<typeof viewModule, 'EditorView'> &
  Pick<typeof editorTextModule, 'appTextLook'> &
  Pick<typeof editorSelectionModule, 'appSelection'> &
  Pick<typeof commanderKeymapModule, 'editorKeymap'> &
  Pick<typeof textWidthsModule, 'terminalCells'>;

async function editorInPage(): Promise<JSHandle<PageEditor>> {
  const built = await esbuild.build({
    stdin: {
      contents: [
        "export { EditorView } from '@codemirror/view';",
        "export { appTextLook } from './editorText';",
        "export { appSelection } from './editorSelection';",
        "export { editorKeymap } from '../tools/commander/shared/keymap';",
        "export { terminalCells } from './textWidths';",
      ].join('\n'),
      resolveDir: path.join(__dirname, '..', 'ui'),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: 'editorOfTheApp',
    write: false,
  });
  return page.evaluateHandle<PageEditor>(
    `${built.outputFiles[0].text};editorOfTheApp`,
  );
}

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

async function mountEditor(
  editor: JSHandle<PageEditor>,
  text: string,
  width: number,
  wrapping: boolean,
): Promise<void> {
  await editor.evaluate(
    async (app, shown) => {
      const old = document.querySelector('.editor-probe');
      const oldEditor = old?.querySelector('.cm-editor');
      if (oldEditor instanceof HTMLElement) {
        app.EditorView.findFromDOM(oldEditor)?.destroy();
      }
      old?.remove();
      const box = document.createElement('div');
      box.className = 'editor-probe';
      box.style.cssText = `position: fixed; left: 0; top: 0; width: ${shown.width}px; z-index: 10`;
      document.body.append(box);
      const table = await app.terminalCells();
      const view = new app.EditorView({
        doc: shown.text,
        extensions: [
          app.appTextLook(table),
          app.appSelection(app.editorKeymap.rowEnd),
          shown.wrapping ? app.EditorView.lineWrapping : [],
        ],
      });
      box.append(view.dom);
    },
    { text, width, wrapping },
  );
}

async function editorLine(
  editor: JSHandle<PageEditor>,
  text: string,
  width: number,
  wrapping: boolean,
): Promise<LaidOut> {
  await mountEditor(editor, text, width, wrapping);
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

const paddedRows = `| Feature${' '.repeat(100)}| What it does${' '.repeat(100)}| Notes|`;

interface Drawn {
  readonly anchor: number;
  readonly head: number;
  readonly edge: number;
  readonly cursor: { readonly x: number; readonly top: number } | undefined;
  readonly placeOfHead: number | undefined;
  readonly selectionRight: number;
  readonly scrollsSideways: boolean;
}

function drawnSelection(editor: JSHandle<PageEditor>): Promise<Drawn> {
  return editor.evaluate(async (app) => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const dom = document.querySelector('.editor-probe .cm-editor');
    const view =
      dom instanceof HTMLElement ? app.EditorView.findFromDOM(dom) : null;
    if (view === null) {
      throw new Error('No editor');
    }
    const line = view.contentDOM.querySelector('.cm-line');
    const edge =
      view.contentDOM.getBoundingClientRect().right -
      (line ? parseFloat(getComputedStyle(line).paddingRight) : 0);
    const cursor = view.dom
      .querySelector('.cm-cursor-primary')
      ?.getBoundingClientRect();
    const { anchor, head } = view.state.selection.main;
    return {
      anchor,
      head,
      edge,
      cursor: cursor && {
        x: cursor.left + cursor.width / 2,
        top: cursor.top,
      },
      placeOfHead: view.coordsAtPos(head)?.left,
      selectionRight: Math.max(
        -Infinity,
        ...Array.from(
          view.dom.querySelectorAll('.cm-selectionBackground'),
          (piece) => piece.getBoundingClientRect().right,
        ),
      ),
      scrollsSideways: view.scrollDOM.scrollWidth > view.scrollDOM.clientWidth,
    };
  });
}

async function select(
  editor: JSHandle<PageEditor>,
  anchor: number,
  head = anchor,
): Promise<Drawn> {
  await editor.evaluate(
    (app, range) => {
      const dom = document.querySelector('.editor-probe .cm-editor');
      const view =
        dom instanceof HTMLElement ? app.EditorView.findFromDOM(dom) : null;
      view?.focus();
      view?.dispatch({ selection: range });
    },
    { anchor, head },
  );
  return drawnSelection(editor);
}

const nearPixel = (a: number | undefined, b: number) =>
  a !== undefined && Math.abs(a - b) < 1;

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

  test('draws the cursor in a run of spaces hanging past the edge of a wrapped row at that edge rather than out of sight, a selection ending in one no further, and never scrolls a wrapped line sideways', async () => {
    const editor = await editorInPage();
    await mountEditor(editor, paddedRows, 400, true);

    const before = await select(editor, 9);
    assert.ok(
      nearPixel(before.cursor?.x, before.placeOfHead ?? NaN),
      JSON.stringify(before),
    );
    assert.ok((before.cursor?.x ?? Infinity) < before.edge - 1);
    for (const head of [60, 108]) {
      const hanging = await select(editor, head);
      assert.ok(
        nearPixel(hanging.cursor?.x, hanging.edge),
        JSON.stringify(hanging),
      );
      assert.ok(nearPixel(hanging.cursor?.top, before.cursor?.top ?? NaN));
      assert.strictEqual(hanging.scrollsSideways, false);
    }
    const selected = await select(editor, 2, 100);
    assert.ok(
      selected.selectionRight <= selected.edge + 0.5,
      JSON.stringify(selected),
    );
    assert.strictEqual(selected.scrollsSideways, false);
  });

  test('moves the cursor on End to the end of a wrapped row, past the run of spaces hanging at its end, drawn at the edge of that row, staying there when pressed again, and selects up to it on Shift+End', async () => {
    const editor = await editorInPage();
    await mountEditor(editor, paddedRows, 400, true);
    const firstRow = await select(editor, 9);
    const secondRow = paddedRows.indexOf('| What');
    const thirdRow = paddedRows.indexOf('| Notes');

    await page.keyboard.press('End');
    const ended = await drawnSelection(editor);
    assert.strictEqual(ended.head, secondRow);
    assert.ok(nearPixel(ended.cursor?.x, ended.edge), JSON.stringify(ended));
    assert.ok(nearPixel(ended.cursor?.top, firstRow.cursor?.top ?? NaN));

    await page.keyboard.press('End');
    const again = await drawnSelection(editor);
    assert.strictEqual(again.head, secondRow);
    assert.ok(nearPixel(again.cursor?.top, firstRow.cursor?.top ?? NaN));

    await select(editor, 2);
    await page.keyboard.press('Shift+End');
    const selected = await drawnSelection(editor);
    assert.deepStrictEqual([selected.anchor, selected.head], [2, secondRow]);

    await select(editor, secondRow + 3);
    await page.keyboard.press('End');
    assert.strictEqual((await drawnSelection(editor)).head, thirdRow);

    await select(editor, thirdRow + 2);
    await page.keyboard.press('End');
    assert.strictEqual((await drawnSelection(editor)).head, paddedRows.length);
  });
});
