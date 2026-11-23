import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { cellsOf, viewerRows } from './cellsSeen';
import {
  editorCells,
  editorLinesSeen,
  editorRowsSeen,
  editorSelected,
} from './editorSeen';
import { untilSettled } from './waits';
import { strings } from '../../lib/shared/strings';
import {
  opened,
  page,
  content,
  activeTab,
  editedText,
  select,
  backToCommander,
  edit,
  toStart,
  toEnd,
  sharedEditorApp,
} from './editorAppFixtures';

interface TextPlace {
  readonly top: number;
  readonly height: number;
  readonly font: string;
  readonly left: number;
  readonly right: number;
}

function namedAndStarred(
  root: Element,
  { name, star }: { readonly name: string; readonly star: string },
): readonly TextPlace[] {
  return [root.querySelector(name), root.querySelector(star)].map((part) => {
    let last: Node | null = null;
    if (part !== null) {
      const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        last = node;
      }
    }
    const range = document.createRange();
    if (last !== null) {
      range.selectNodeContents(last);
    }
    const rect = range.getBoundingClientRect();
    return {
      top: Math.round(rect.top * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      font:
        last?.parentElement === null || last?.parentElement === undefined
          ? ''
          : getComputedStyle(last.parentElement).fontFamily,
      left: rect.left,
      right: Math.min(
        rect.right,
        part?.getBoundingClientRect().right ?? rect.right,
      ),
    };
  });
}

async function starredAfter(
  root: Locator,
  parts: { readonly name: string; readonly star: string },
): Promise<void> {
  assert.strictEqual(await root.locator(parts.star).textContent(), '*');
  const [named, starred] = await root.evaluate(namedAndStarred, parts);
  assert.ok(named !== undefined && starred !== undefined);
  assert.deepStrictEqual(
    { top: starred.top, height: starred.height, font: starred.font },
    { top: named.top, height: named.height, font: named.font },
  );
  assert.ok(
    Math.abs(starred.left - named.right) < 0.5,
    `${starred.left} right after ${named.right}`,
  );
}

function baselinesOf(line: Element) {
  const top = line.getBoundingClientRect().top;
  const baselineOf = (element: Element | null) => {
    if (element === null) {
      return undefined;
    }
    const probe = document.createElement('span');
    probe.style.display = 'inline-block';
    probe.style.height = '0';
    element.append(probe);
    const at = probe.getBoundingClientRect().bottom - top;
    probe.remove();
    return Math.round(at * devicePixelRatio * 64) / 64;
  };
  return {
    name: baselineOf(line.querySelector('.path-name')),
    mark: baselineOf(line.querySelector('.editor-mark')),
  };
}

const cells = () => cellsOf(page, editorCells);

const kindsOf = async (line: number) =>
  (await editorLinesSeen(page)).find(({ number }) => number === line)?.kinds ??
  {};

suite('App editor', () => {
  sharedEditorApp();

  test('colors the code edited by its language as the viewer does, coloring again as it is typed', async () => {
    await backToCommander();
    await edit('code.ts');
    await waitFor(
      async () => (await kindsOf(1)).keyword !== undefined,
      'the first line colored',
    );
    assert.deepStrictEqual(await kindsOf(1), {
      keyword: 'const=;',
      plain: ' a  ',
      number: '1',
    });
    await toStart();
    await page.keyboard.type('// ');
    await waitFor(
      async () => (await kindsOf(1)).comment === '// const a = 1;',
      'the line colored as a comment',
    );
    await waitFor(
      async () => ((await kindsOf(2)).keyword ?? '') !== '',
      'the next line still colored',
    );
  });

  test('shows the whitespace, as it does by default, the spaces dotted, the tabs signed and a sign after each line that ends in CRLF, hides it once its button is pressed, and shows it again', async () => {
    fs.writeFileSync(path.join(opened, 'blanks.txt'), 'a  b\r\nc\td\n e\r\n');
    await backToCommander();
    await edit('blanks.txt');
    await waitFor(
      async () => (await editedText()) === 'a  b\nc\td\n e\n',
      'the text',
    );
    const toggle = page.locator('.editor button[data-tip="Show Whitespace"]');
    const dotted = async () => (await cells().dots()).length;
    const signedRows = async () =>
      (await cells().glyphs(strings.symbols.carriageReturn))
        .map(({ row }) => row)
        .toSorted((one, other) => one - other);
    await waitFor(async () => (await dotted()) === 3, 'the spaces dotted');
    assert.strictEqual((await cells().glyphs(strings.symbols.tab)).length, 1);
    assert.deepStrictEqual(await signedRows(), [0, 2]);
    await toggle.click();
    try {
      await waitFor(async () => (await dotted()) === 0, 'no space dotted');
      assert.deepStrictEqual(await signedRows(), []);
      assert.strictEqual((await cells().glyphs(strings.symbols.tab)).length, 0);
    } finally {
      await toggle.click();
    }
    await waitFor(
      async () => (await dotted()) === 3,
      'the spaces dotted again',
    );
  });

  test('shows the text selected as selected, focused or not', async () => {
    fs.writeFileSync(path.join(opened, 'selected.txt'), 'one\ntwo\n');
    await backToCommander();
    await edit('selected.txt');
    await content().click();
    await page.keyboard.press('ControlOrMeta+A');
    await waitFor(
      async () => (await editorSelected(page)).join() === 'one,two',
      'both lines selected',
    );
    await page.locator('.editor .editor-path').click();
    await page
      .locator('.editor .cm-editor.cm-focused')
      .waitFor({ state: 'detached' });
    assert.deepStrictEqual(await editorSelected(page), ['one', 'two']);
  });

  test('marks a file changed with a star right after its name, in its path and on its tab, in the font of each and on the line of the name', async () => {
    fs.writeFileSync(path.join(opened, 'starred.txt'), 'one\n');
    await backToCommander();
    await edit('starred.txt');
    await toEnd();
    await page.keyboard.type('!');
    const mark = page.locator('.editor .editor-mark.unsaved');
    await mark.waitFor();
    await starredAfter(page.locator('.editor .editor-path'), {
      name: '.path-title',
      star: '.editor-mark',
    });
    await starredAfter(activeTab(), {
      name: '.tab-name',
      star: '.tab-unsaved',
    });
  });

  test('starts the text of a file viewed where the editor starts it, after an empty column as wide as its line numbers', async () => {
    fs.writeFileSync(path.join(opened, 'columns.txt'), 'first line\nsecond\n');
    await backToCommander();
    await select('columns.txt');
    await page.keyboard.press('F3');
    await page.locator(viewerRows).first().waitFor();
    const inViewer = await page
      .locator('.viewer-rows .cell-rows')
      .first()
      .evaluate(
        (host) =>
          host.getBoundingClientRect().left -
          parseFloat(getComputedStyle(host).marginLeft),
      );
    await page.keyboard.press('F4');
    await waitFor(
      async () => (await editedText()) === 'first line\nsecond\n',
      'the text in the editor',
    );
    const [first] = await untilSettled(
      () => editorRowsSeen(page),
      'the rows of the editor',
      { accepted: (rows) => rows.length > 0 },
    );
    const inEditor =
      first === undefined ? NaN : first.left - first.column * first.advance;
    assert.ok(
      Math.abs(inViewer - inEditor) < 0.5,
      `${inViewer} in the viewer, ${inEditor} in the editor`,
    );
  });

  test('dots the spaces of a line of thousands of columns only around the columns in sight, and around those it is scrolled sideways to once it is, as every run of the line was measured and drawn wherever the editor scrolled', async () => {
    fs.writeFileSync(
      path.join(opened, 'wide.txt'),
      Array.from({ length: 3 }, () =>
        Array.from({ length: 3000 }, (_, at) => `w${at}`).join(' '),
      ).join(String.fromCharCode(10)),
    );
    await backToCommander();
    await edit('wide.txt');
    await waitFor(
      async () => (await editedText()).startsWith('w0 w1 '),
      'the text',
    );
    await toStart();
    const scroller = page.locator('.editor .cm-scroller');
    const dotted = async () => {
      const columns = (await cells().dots()).map(({ column }) => column);
      const advance = (await editorRowsSeen(page))[0]?.advance ?? 0;
      return {
        runs: columns.length,
        from: Math.min(...columns) * advance,
        to: Math.max(...columns) * advance,
        ...(await scroller.evaluate((element) => ({
          left: element.scrollLeft,
          wide: element.clientWidth,
        }))),
      };
    };
    await waitFor(async () => (await dotted()).runs > 0, 'the dots');
    const atStart = await dotted();
    await scroller.evaluate((element) => {
      element.scrollLeft = element.scrollWidth / 2;
    });
    await waitFor(async () => {
      const now = await dotted();
      return now.left > 0 && now.from > atStart.to;
    }, 'the dots of the columns scrolled to');
    const scrolled = await dotted();

    assert.ok(
      atStart.to - atStart.from < 3 * atStart.wide,
      JSON.stringify(atStart),
    );
    assert.ok(
      scrolled.from < scrolled.left + scrolled.wide &&
        scrolled.to > scrolled.left &&
        scrolled.to - scrolled.from < 3 * scrolled.wide,
      JSON.stringify(scrolled),
    );
  });

  test('keeps the name of a file where it stands in its path once a mark in the font of the app follows it, as Read-only, the mark on the line of the name', async () => {
    const pathLine = page.locator('.editor .editor-path');
    await backToCommander();
    await edit('notes.txt');
    await pathLine.locator('.path-name').waitFor();
    const alone = await pathLine.evaluate(baselinesOf);
    assert.strictEqual(alone.mark, undefined);
    await backToCommander();
    await page.keyboard.press('Alt+F');
    await page.getByText(strings.tabs.openDefaultSettings).click();
    await pathLine
      .locator('.editor-mark', { hasText: strings.editor.readOnlyMark })
      .waitFor();
    const marked = await pathLine.evaluate(baselinesOf);
    assert.deepStrictEqual(marked, { name: alone.name, mark: alone.name });
    await page.keyboard.press('Escape');
    await pathLine
      .locator('.editor-mark', { hasText: strings.editor.readOnlyMark })
      .waitFor({ state: 'detached' });
  });
});
