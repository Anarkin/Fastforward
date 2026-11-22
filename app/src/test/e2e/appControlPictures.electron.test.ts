import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { cellPoint, viewerTexts } from './cellsSeen';
import { untilSettled, waitForFocus } from './waits';

const character = (code: number) => String.fromCharCode(code);
const lineFeed = character(10);
const formFeed = character(12);
const escape = character(27);
const controlFont = 'Fastforward Controls';

const groups = [
  [1, 2, 3, 4, 5, 6, 7, 8],
  [11, 12, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26, 27],
  [28, 29, 30, 31, 127],
];
const padded = (text: string) => `${text.padEnd(20)}|`;
const ruler = padded('....:....1....:....2');
const written = groups.map((codes) =>
  padded(`x ${codes.map(character).join('')}`),
);
const drawn = (text: string) => text.replaceAll(formFeed, '␌');
const keptWritten = padded(`kept ␌${formFeed}␛${escape}`);
const boxedRow = `boxed 😀 and 中${' '.repeat(5)}|`;
const fileOf = (last: string) =>
  [ruler, ...written, keptWritten, boxedRow, last, ''].join(lineFeed);
const denseLines = [
  `x${'.'.repeat(60)}|`,
  ...Array.from(
    { length: 40 },
    (_, line) => `x${character(1 + (line % 8)).repeat(60)}|`,
  ),
];

const viewer = {
  name: 'viewer',
  tab: 1,
  pane: '.viewer-body',
  rows: '.viewer-rows .cell-rows',
} as const;

const views = [
  {
    name: 'editor',
    tab: 2,
    pane: '.editor .cm-content',
    rows: '.editor .cm-line',
  },
  {
    name: 'old side of the diff',
    tab: 3,
    pane: '.diff-view .virtual-rows',
    rows: '.diff-view .split-line > .split-side:first-child .code',
  },
  {
    name: 'new side of the diff',
    tab: 3,
    pane: '.diff-view .virtual-rows',
    rows: '.diff-view .split-line > .split-side:last-child .code',
  },
] as const;

type View = (typeof views)[number] | typeof viewer;

interface Shown {
  readonly name: string;
  readonly tab: number;
  readonly rows: string;
}

interface DrawnRow {
  readonly text: string;
  readonly bar: number | undefined;
  readonly offColumns: number;
}

function drawnRows(selector: string): DrawnRow[] {
  const range = document.createRange();
  return [...document.querySelectorAll(selector)].map((row) => {
    let text = '';
    let bar: number | undefined;
    const lefts: number[] = [];
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('[aria-hidden="true"]')) {
        continue;
      }
      const part = node.textContent ?? '';
      for (let at = 0; at < part.length; at++) {
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        const { left } = range.getBoundingClientRect();
        lefts.push(left);
        if (part[at] === '|') {
          bar = left;
        }
      }
      text += part;
    }
    const column = lefts.length > 1 ? (lefts.at(1) ?? 0) - (lefts[0] ?? 0) : 0;
    const plain = text
      .split('')
      .every(
        (each) => each.charCodeAt(0) < 0x80 || each === '␌' || each === '␛',
      );
    return {
      text,
      bar,
      offColumns: plain
        ? lefts.filter(
            (left, at) => Math.abs(left - (lefts[0] ?? 0) - at * column) > 0.02,
          ).length
        : 0,
    };
  });
}

function selectRow([selector, at]: readonly [string, number]): boolean {
  const row = document.querySelectorAll(selector)[at];
  if (row === undefined) {
    return false;
  }
  const range = document.createRange();
  range.selectNodeContents(row);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
  return true;
}

function keepCopied(): void {
  Reflect.deleteProperty(window, 'copied');
  window.addEventListener(
    'copy',
    (event) =>
      Reflect.set(
        window,
        'copied',
        event.clipboardData?.getData('text/plain') ||
          getSelection()?.toString(),
      ),
    { once: true },
  );
}

function markRowWith([selector, text]: readonly [string, string]): boolean {
  for (const marked of document.querySelectorAll('[data-fonts-of]')) {
    marked.removeAttribute('data-fonts-of');
  }
  const row = [...document.querySelectorAll(selector)].find((each) =>
    (each.textContent ?? '').includes(text),
  );
  row?.setAttribute('data-fonts-of', '');
  return row !== undefined;
}

const legible = (text: unknown) =>
  typeof text === 'string'
    ? text.replace(/[^ -~]/g, (each) => `<${each.charCodeAt(0).toString(16)}>`)
    : text;

suite('App control pictures', () => {
  let app: ElectronApplication;
  let page: Page;

  const show = async (view: Shown, first = ruler) => {
    await page.locator('.tabs .tab').nth(view.tab).click();
    await waitFor(
      async () =>
        view.name === 'viewer'
          ? (await viewerTexts(page)).includes(first)
          : (await page.evaluate(drawnRows, view.rows)).some(
              (row) => row.text === first,
            ),
      `the first row in the ${view.name}`,
    );
  };

  const fontsDrawing = async (rows: string, text: string) => {
    assert.ok(await page.evaluate(markRowWith, [rows, text] as const), text);
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('DOM.enable');
      await session.send('CSS.enable');
      const { root } = await session.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await session.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: '[data-fonts-of]',
      });
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', {
        nodeId,
      });
      return fonts
        .filter((font) => font.isCustomFont)
        .map((font) => `${font.familyName} ${font.glyphCount}`);
    } finally {
      await session.detach();
    }
  };

  const copiedFrom = async (view: View, row: number) => {
    await show(view);
    if (view.name === 'editor') {
      await page.locator(view.rows).nth(row).click();
      await waitForFocus(page.locator(view.pane), 'the editor');
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
    } else if (view.name === 'viewer') {
      const inRow = await cellPoint(page, row, 1);
      await page.mouse.click(inRow.x, inRow.y, { clickCount: 3 });
      await waitForFocus(page.locator(view.pane).first(), 'the viewer');
    } else {
      await page.locator(view.pane).first().focus();
      assert.ok(
        await page.evaluate(selectRow, [view.rows, row] as const),
        `no row to select in the ${view.name}`,
      );
    }
    await page.evaluate(keepCopied);
    await page.keyboard.press('ControlOrMeta+C');
    await waitFor(
      async () =>
        (await page.evaluate((): unknown => Reflect.get(window, 'copied'))) !==
        undefined,
      `the row copied from the ${view.name}`,
    );
    const copied = await page.evaluate((): unknown =>
      Reflect.get(window, 'copied'),
    );
    await page.evaluate(() => getSelection()?.removeAllRanges());
    return copied;
  };

  beforeAll(async () => {
    const folder = tempFolder('control-pictures');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    const one = path.join(opened, 'controls-one.txt');
    const two = path.join(opened, 'controls-two.txt');
    const markdown = path.join(opened, 'controls.md');
    fs.writeFileSync(one, fileOf('same'));
    fs.writeFileSync(two, fileOf('changed'));
    fs.writeFileSync(
      markdown,
      [
        `A bell ${character(7)} in a sentence, fed${formFeed}on.`,
        '',
        '```',
        `${escape}[0m${character(127)}${formFeed}`,
        '```',
        '',
      ].join(lineFeed),
    );
    const code = path.join(opened, 'colored.ts');
    fs.writeFileSync(
      code,
      `export const fed = '${formFeed}page${escape}';${lineFeed}`,
    );
    const dense = path.join(opened, 'dense.txt');
    fs.writeFileSync(dense, denseLines.join(lineFeed));
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: opened },
          { id: '2', tool: 'viewer', root: one },
          { id: '3', tool: 'editor', root: one },
          { id: '4', tool: 'diff', compare: { old: one, new: two } },
          { id: '5', tool: 'viewer', root: markdown },
          { id: '6', tool: 'editor', root: code },
          { id: '7', tool: 'editor', root: dense },
          { id: '8', tool: 'viewer', root: dense },
        ],
        activeTab: '2',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({
        scrolling: { smooth: false },
        text: { wordWrap: false, highlightOccurrences: false },
      }),
    );
    app = await launchApp(profile, { scale: 1.25 });
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  test('draws every control character in the editor and both sides of the diff where it stands in the text, by the font the app makes for them, each exactly a column wide, the form feed as its picture, which Chromium draws as nothing, so every character of a row stands on its column and the bar after them under the bar of the ruler, and shows the viewer every row as the file has it, its cells drawing each character by its picture in a cell', async () => {
    const found: Record<string, unknown> = {};
    await show(viewer);
    const viewed = await viewerTexts(page);
    assert.deepStrictEqual(
      [...written, keptWritten]
        .filter((text) => viewed.includes(text))
        .map(legible),
      [...written, keptWritten].map(legible),
    );
    for (const view of views) {
      await show(view);
      const rows = await untilSettled(
        () => page.evaluate(drawnRows, view.rows),
        `the rows of the ${view.name}`,
      );
      const bars = new Set(
        rows
          .filter((row) => row.bar !== undefined)
          .map((row) => Math.round((row.bar ?? 0) * 100) / 100),
      );
      found[view.name] = {
        drawn: [...written.map(drawn), drawn(keptWritten)]
          .filter((text) => rows.some((row) => row.text === text))
          .map(legible),
        bars: bars.size,
        offColumns: rows.reduce((sum, row) => sum + row.offColumns, 0),
        fonts: await fontsDrawing(view.rows, 'x \u0001'),
      };
    }
    assert.deepStrictEqual(
      found,
      Object.fromEntries(
        views.map((view) => [
          view.name,
          {
            drawn: [...written.map(drawn), drawn(keptWritten)].map(legible),
            bars: 1,
            offColumns: 0,
            fonts: [`${controlFont} 8`],
          },
        ]),
      ),
    );
  });

  test('copies the control characters as they are out of the viewer, the editor and the diff, the form feed itself, not the picture drawn for it, keeps a picture of it the file itself holds, and copies a row as it is written whatever of it is drawn in a box, as a character shrunk into its box came out with a line break on either side', async () => {
    const found: Record<string, unknown> = {};
    for (const view of [viewer, ...views]) {
      found[view.name] = [
        legible(await copiedFrom(view, 1)),
        legible(await copiedFrom(view, 2)),
        legible(await copiedFrom(view, written.length + 1)),
        legible(await copiedFrom(view, written.length + 2)),
      ];
    }
    assert.deepStrictEqual(
      found,
      Object.fromEntries(
        [viewer, ...views].map((view) => [
          view.name,
          [
            legible(written[0]),
            legible(written[1]),
            legible(keptWritten),
            legible(boxedRow),
          ],
        ]),
      ),
    );
  });

  test('draws the picture of a form feed in the editor in the color of the code around it, inside the span that colors it, as the viewer and the diff do, and the other control characters as text of that span, with no element of their own', async () => {
    await page.locator('.tabs .tab').nth(5).click();
    const colored = page.locator('.editor .cm-line .syntax-string').first();
    await colored.waitFor();
    const pictures = page.locator('.editor .cm-line .control-picture');
    await pictures.first().waitFor();
    assert.deepStrictEqual(
      await pictures.evaluateAll((shown) =>
        shown.map((each) => [
          each.textContent,
          each.parentElement?.className,
          getComputedStyle(each).color ===
            getComputedStyle(each.parentElement ?? each).color,
        ]),
      ),
      [['␌', 'syntax-string', true]],
    );
    assert.strictEqual(
      legible(await colored.textContent()),
      legible(`␌page${escape}`),
    );
  });

  test('draws a file dense in control characters in the editor, every one by the font where it stands in the text, with no element of its own, each line as wide as one of as many dots, as an element for the picture of each took longer to paint than the characters to lay out, so the editor left such a file in boxes, off the columns, and shows the viewer its rows as written', async () => {
    const found: Record<string, unknown> = {};
    const tabs = [{ name: 'editor', tab: 6, rows: '.editor .cm-line' }];
    await show({ ...viewer, tab: 7 }, denseLines[0]);
    const viewed = await untilSettled(
      () => viewerTexts(page),
      'the rows of the viewer',
    );
    found.viewer = {
      rows: viewed.length >= 20,
      asWritten: viewed.every((text, at) => text === denseLines[at]),
    };
    for (const view of tabs) {
      await show(view, denseLines[0]);
      const rows = await untilSettled(
        () => page.evaluate(drawnRows, view.rows),
        `the rows of the ${view.name}`,
      );
      found[view.name] = {
        rows: rows.length >= 20,
        asWritten: rows.every((row, at) => row.text === denseLines[at]),
        bars: new Set(rows.map((row) => Math.round((row.bar ?? 0) * 100) / 100))
          .size,
        offColumns: rows.reduce((sum, row) => sum + row.offColumns, 0),
        elements: await page.locator(view.rows).nth(1).locator('*').count(),
        fonts: await fontsDrawing(view.rows, 'x\u0001'),
      };
    }
    const expected = {
      rows: true,
      asWritten: true,
      bars: 1,
      offColumns: 0,
      elements: 0,
      fonts: [`${controlFont} 60`],
    };
    assert.deepStrictEqual(found, {
      editor: expected,
      viewer: { rows: true, asWritten: true },
    });
  });

  test('draws the control characters of a Markdown file previewed by the font too, in its text and in its code, the form feed as its picture', async () => {
    await page.locator('.tabs .tab').nth(4).click();
    const preview = page.locator('.markdown');
    await preview.locator('pre > code').waitFor();
    assert.strictEqual(
      legible(await preview.locator('p').first().textContent()),
      legible(`A bell ${character(7)} in a sentence, fed␌on.`),
    );
    assert.strictEqual(
      legible((await preview.locator('pre > code').textContent())?.trimEnd()),
      legible(`${escape}[0m${character(127)}␌`),
    );
    assert.deepStrictEqual(await fontsDrawing('.markdown p', 'A bell'), [
      `${controlFont} 2`,
    ]);
  });
});
