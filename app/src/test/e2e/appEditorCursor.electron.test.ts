import * as assert from 'node:assert';
import type { JSHandle } from 'playwright-core';
import { suite, test } from 'vitest';
import { app as electronApp, page, sharedApp } from './appFixtures';
import { waitFor } from '../helpers/fixtures';
import { editorInPage, mountEditor, type PageEditor } from './editorProbe';

const paddedRows = `| Feature${' '.repeat(100)}| What it does${' '.repeat(100)}| Notes|`;

interface Drawn {
  readonly anchor: number;
  readonly head: number;
  readonly edge: number;
  readonly cursor:
    | {
        readonly x: number;
        readonly right: number;
        readonly top: number;
        readonly shown: number;
      }
    | undefined;
  readonly placeOfHead: number | undefined;
  readonly scrollsSideways: boolean;
}

function drawnSelection(editor: JSHandle<PageEditor>): Promise<Drawn> {
  return editor.evaluate(async (app) => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const dom = document.querySelector('.editor-probe .editor-surface');
    const view =
      dom instanceof HTMLElement ? app.EditorView.findFromDOM(dom) : null;
    if (view === null) {
      throw new Error('No editor');
    }
    const cell = document.createElement('span');
    cell.style.cssText =
      'display: inline-block; position: absolute; width: var(--text-advance)';
    view.scrollDOM.append(cell);
    const advance = cell.getBoundingClientRect().width;
    cell.remove();
    const content = view.contentDOM.getBoundingClientRect();
    const style = getComputedStyle(view.contentDOM);
    const textLeft = content.left + parseFloat(style.paddingLeft);
    const columns = Math.floor(
      (content.right - parseFloat(style.paddingRight) - textLeft) / advance +
        1e-6,
    );
    const edge = textLeft + (columns + 1) * advance;
    const cursor = view.dom
      .querySelector('.editor-cursor-primary')
      ?.getBoundingClientRect();
    const element = view.dom.querySelector('.editor-cursor-primary');
    const clip = { left: -Infinity, right: Infinity };
    for (
      let holder = element?.parentElement ?? null;
      holder !== null && holder !== document.body;
      holder = holder.parentElement
    ) {
      if (getComputedStyle(holder).overflowX !== 'visible') {
        const box = holder.getBoundingClientRect();
        clip.left = Math.max(clip.left, box.left + holder.clientLeft);
        clip.right = Math.min(
          clip.right,
          box.left + holder.clientLeft + holder.clientWidth,
        );
      }
    }
    const { anchor, head } = view.state.selection.main;
    const host = view.dom.querySelector('.editor-cells');
    const rows = host instanceof HTMLElement ? (host.seenRows?.() ?? []) : [];
    const holding = rows.findIndex(
      ({ from, text }) => from <= head && head < from + text.length,
    );
    const held = rows[holding];
    const column =
      host instanceof HTMLElement
        ? host
            .seenPlaces?.(holding)
            .find(([place]) => place === head - (held?.from ?? 0))?.[1]
        : undefined;
    return {
      anchor,
      head,
      edge,
      cursor: cursor && {
        x: cursor.left,
        right: cursor.right,
        top: cursor.top,
        shown:
          Math.min(cursor.right, clip.right) - Math.max(cursor.left, clip.left),
      },
      placeOfHead:
        held === undefined || column === undefined
          ? undefined
          : held.left + (column - held.column) * held.advance,
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
      const dom = document.querySelector('.editor-probe .editor-surface');
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

async function zoomTo(ratio: number | undefined): Promise<void> {
  const wanted = await electronApp.evaluate(
    ({ BrowserWindow, screen }, asked) => {
      let shown = 1;
      for (const window of BrowserWindow.getAllWindows()) {
        const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
        shown = asked ?? scale;
        window.webContents.setZoomFactor(shown / scale);
      }
      return shown;
    },
    ratio,
  );
  await waitFor(
    () =>
      page.evaluate(
        (shown) =>
          devicePixelRatio === shown &&
          Math.abs(
            parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue(
                '--device-pixel',
              ),
            ) -
              1 / shown,
          ) < 1e-6,
        wanted,
      ),
    `the window at ${wanted * 100}%`,
  );
}

const longWrappedLine = Array.from(
  { length: 2000 },
  (_, index) =>
    `{"row":${index},"words":"a sentence of some words, with commas and dots."},`,
).join('');

interface OnCharacter {
  readonly cursorLeft: number;
  readonly cursorMiddle: number;
  readonly cursorHeight: number;
  readonly characterLeft: number;
  readonly characterMiddle: number;
  readonly rowHeight: number;
}

async function cursorOnCharacter(
  editor: JSHandle<PageEditor>,
  head: number,
): Promise<OnCharacter> {
  await editor.evaluate((app, at) => {
    const dom = document.querySelector('.editor-probe .editor-surface');
    const view =
      dom instanceof HTMLElement ? app.EditorView.findFromDOM(dom) : null;
    view?.focus();
    view?.dispatch({ selection: { anchor: at }, scrollIntoView: true });
  }, head);
  let last = '';
  let found: OnCharacter | undefined;
  await waitFor(async () => {
    found = await editor.evaluate(async (app, at) => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const dom = document.querySelector('.editor-probe .editor-surface');
      const view =
        dom instanceof HTMLElement ? app.EditorView.findFromDOM(dom) : null;
      const cursor = view?.dom
        .querySelector('.editor-cursor-primary')
        ?.getBoundingClientRect();
      const host = view?.dom.querySelector('.editor-cells');
      const rows = host instanceof HTMLElement ? (host.seenRows?.() ?? []) : [];
      const index = rows.findIndex(
        ({ from, text }) => from <= at && at < from + text.length,
      );
      const row = rows[index];
      const column =
        host instanceof HTMLElement
          ? host
              .seenPlaces?.(index)
              .find(([place]) => place === at - (row?.from ?? 0))?.[1]
          : undefined;
      if (!view || !cursor || row === undefined || column === undefined) {
        return undefined;
      }
      return {
        cursorLeft: cursor.left,
        cursorMiddle: (cursor.top + cursor.bottom) / 2,
        cursorHeight: cursor.height,
        characterLeft: row.left + (column - row.column) * row.advance,
        characterMiddle: row.top + row.height / 2,
        rowHeight: parseFloat(getComputedStyle(view.contentDOM).lineHeight),
      };
    }, head);
    const now = JSON.stringify(found);
    const settled = found !== undefined && now === last;
    last = now;
    return settled;
  }, `the cursor at ${head} to settle`);
  if (found === undefined) {
    throw new Error(`No cursor at ${head}`);
  }
  return found;
}

suite('App', () => {
  sharedApp({});

  test('draws the cursor in a run of spaces hanging past the edge of a wrapped row on the column kept past that row for a blank hanging there, whole, where the viewer and the diff mark that blank, rather than out of sight, and never scrolls a wrapped line sideways, with text selected through such a run either', async () => {
    const editor = await editorInPage();
    await mountEditor(editor, paddedRows, 400, true);

    let before = await select(editor, 9);
    await waitFor(async () => {
      before = await drawnSelection(editor);
      return before.placeOfHead !== undefined;
    }, 'the cells of the editor to show its text');
    assert.ok(
      nearPixel(before.cursor?.x, before.placeOfHead ?? NaN),
      JSON.stringify(before),
    );
    assert.ok((before.cursor?.x ?? Infinity) < before.edge - 1);
    for (const head of [60, 108]) {
      const hanging = await select(editor, head);
      assert.ok(
        nearPixel(hanging.cursor?.right, hanging.edge),
        JSON.stringify(hanging),
      );
      assert.ok(
        nearPixel(
          hanging.cursor?.shown,
          (hanging.cursor?.right ?? 0) - (hanging.cursor?.x ?? 0),
        ),
        JSON.stringify(hanging),
      );
      assert.ok(nearPixel(hanging.cursor?.top, before.cursor?.top ?? NaN));
      assert.strictEqual(hanging.scrollsSideways, false);
    }
    const selected = await select(editor, 2, 100);
    assert.strictEqual(selected.scrollsSideways, false);
  });

  test('scrolls an unwrapped line of wide characters sideways as far as its cells reach, the cursor at its end drawn whole in sight, and keeps the line as tall as a row, as the text the browser lays out under the cells is not as wide as they are, nor always as tall', async () => {
    const editor = await editorInPage();
    const wide = '中文'.repeat(100);
    await mountEditor(editor, `${wide}\nplain`, 400, false);
    await select(editor, 0);
    await page.keyboard.press('End');
    let ended = await drawnSelection(editor);
    await waitFor(async () => {
      ended = await drawnSelection(editor);
      return ended.head === wide.length && ended.scrollsSideways;
    }, 'the end of the line in sight');
    const width = (ended.cursor?.right ?? 0) - (ended.cursor?.x ?? 0);
    assert.ok(width >= 1, JSON.stringify(ended));
    assert.ok(nearPixel(ended.cursor?.shown, width), JSON.stringify(ended));
    const reach = await editor.evaluate((app) => {
      const dom = document.querySelector('.editor-probe .editor-surface');
      const view =
        dom instanceof HTMLElement ? app.EditorView.findFromDOM(dom) : null;
      if (view === null) {
        throw new Error('No editor');
      }
      const cell = document.createElement('span');
      cell.style.cssText =
        'display: inline-block; position: absolute; width: var(--text-advance)';
      view.scrollDOM.append(cell);
      const advance = cell.getBoundingClientRect().width;
      cell.remove();
      const style = getComputedStyle(view.contentDOM);
      return {
        columns:
          Math.round(
            ((view.contentDOM.getBoundingClientRect().width -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight)) /
              advance) *
              100,
          ) / 100,
        rows:
          Math.round(
            (view.contentDOM.getBoundingClientRect().height /
              parseFloat(style.lineHeight)) *
              100,
          ) / 100,
      };
    });
    assert.deepStrictEqual(reach, { columns: 2 * wide.length, rows: 2 });
  });

  test('draws the cursor of an unwrapped line whole where it scrolled sideways to, past the first width of the editor', async () => {
    const editor = await editorInPage();
    const long = 'word '.repeat(200);
    await mountEditor(editor, long, 400, false);
    await select(editor, 2);
    await page.keyboard.press('End');
    let ended = await drawnSelection(editor);
    await waitFor(async () => {
      ended = await drawnSelection(editor);
      return ended.head === long.length && ended.scrollsSideways;
    }, 'the end of the line in sight');
    const width = (ended.cursor?.right ?? 0) - (ended.cursor?.x ?? 0);
    assert.ok(width >= 1, JSON.stringify(ended));
    assert.ok(nearPixel(ended.cursor?.shown, width), JSON.stringify(ended));
  });

  test('scrolls an unwrapped line sideways while the pointer selecting it is held past the right edge of the editor, the selection reaching on with the text, and back while it is held before where the text starts', async () => {
    const editor = await editorInPage();
    const long = 'word '.repeat(200);
    await mountEditor(editor, long, 400, false);
    let start = await select(editor, 0);
    await waitFor(async () => {
      start = await drawnSelection(editor);
      return start.placeOfHead !== undefined && start.cursor !== undefined;
    }, 'the cells of the editor to show its text');
    const box = await page
      .locator('.editor-probe .editor-scroller')
      .boundingBox();
    assert.ok(box, 'the editor has no box');
    const y = (start.cursor?.top ?? 0) + 4;
    const reached = () =>
      editor.evaluate((app) => {
        const dom = document.querySelector('.editor-probe .editor-surface');
        const view =
          dom instanceof HTMLElement ? app.EditorView.findFromDOM(dom) : null;
        return {
          across: view?.scrollDOM.scrollLeft ?? 0,
          head: view?.state.selection.main.head ?? 0,
          anchor: view?.state.selection.main.anchor ?? 0,
        };
      });
    await page.mouse.move((start.placeOfHead ?? 0) + 2, y);
    await page.mouse.down();
    try {
      await page.mouse.move(box.x + box.width + 30, y, { steps: 3 });
      let far = await reached();
      await waitFor(async () => {
        far = await reached();
        return far.across > 200 && far.head > 100;
      }, 'the line scrolled sideways under the pointer held past its edge');
      assert.strictEqual(far.anchor, 0);
      await page.mouse.move(box.x + 2, y, { steps: 3 });
      await waitFor(
        async () => (await reached()).across === 0,
        'the line scrolled back under the pointer held before its text',
      );
    } finally {
      await page.mouse.up();
    }
  });

  test('moves the cursor on End to the end of a wrapped row, past the run of spaces hanging at its end, drawn whole on the column kept past that row for a blank hanging there, staying there when pressed again, and selects up to it on Shift+End', async () => {
    const editor = await editorInPage();
    await mountEditor(editor, paddedRows, 400, true);
    const firstRow = await select(editor, 9);
    const secondRow = paddedRows.indexOf('| What');
    const thirdRow = paddedRows.indexOf('| Notes');

    await page.keyboard.press('End');
    const ended = await drawnSelection(editor);
    assert.strictEqual(ended.head, secondRow);
    assert.ok(
      nearPixel(ended.cursor?.right, ended.edge),
      JSON.stringify(ended),
    );
    assert.ok(!ended.scrollsSideways, JSON.stringify(ended));
    assert.ok(
      nearPixel(
        ended.cursor?.shown,
        (ended.cursor?.right ?? 0) - (ended.cursor?.x ?? 0),
      ),
      JSON.stringify(ended),
    );
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

  for (const ratio of [1, 1.25, 1.5, 1.75]) {
    test(`draws the cursor on the character it stands on far into a wrapped line of ${longWrappedLine.length.toLocaleString('en')} characters at ${ratio * 100}%, on the row of the character past the stretches of the line the editor leaves undrawn, as tall as the row, within half a device pixel`, async () => {
      await zoomTo(ratio);
      try {
        const editor = await editorInPage();
        await mountEditor(editor, longWrappedLine, 600, true);
        await page.locator('.editor-probe').evaluate((box) => {
          if (box instanceof HTMLElement) {
            box.style.height = '300px';
          }
          const editorBox = box.querySelector('.editor-surface');
          if (editorBox instanceof HTMLElement) {
            editorBox.style.height = '100%';
          }
        });
        const halfPixel = 0.5 / ratio + 1e-3;
        const wrong: string[] = [];
        for (const head of [60, 30_000, 60_000, 90_000, 120_000]) {
          const found = await cursorOnCharacter(editor, head);
          if (
            Math.abs(found.cursorLeft - found.characterLeft) > halfPixel ||
            Math.abs(found.cursorMiddle - found.characterMiddle) > halfPixel ||
            Math.abs(found.cursorHeight - found.rowHeight) > 1e-3
          ) {
            wrong.push(`${head}: ${JSON.stringify(found)}`);
          }
        }
        assert.deepStrictEqual(wrong, []);
      } finally {
        await zoomTo(undefined);
      }
    });
  }
});
