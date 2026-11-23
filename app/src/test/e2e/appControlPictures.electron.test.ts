import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { cellsOf } from './cellsSeen';
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

const editor = {
  name: 'editor',
  tab: 2,
  pane: '.editor .cm-content',
  rows: '.editor .editor-cells',
} as const;

const cellViews = [
  viewer,
  editor,
  {
    name: 'old side of the diff',
    tab: 3,
    pane: '.diff-view .virtual-rows',
    rows: '.diff-view .diff-cells',
  },
  {
    name: 'new side of the diff',
    tab: 3,
    pane: '.diff-view .virtual-rows',
    rows: '.diff-view .diff-cells ~ .diff-cells',
  },
] as const;

type CellView = (typeof cellViews)[number];

interface Shown {
  readonly name: string;
  readonly tab: number;
  readonly rows: string;
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
        (await cellsOf(page, view.rows).rows()).some(
          ({ line }) => line === first,
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

  const copiedFrom = async (view: CellView, row: number) => {
    await show(view);
    const inRow = await cellsOf(page, view.rows).point(row, 1);
    if (view.name === 'editor') {
      await page.mouse.click(inRow.x, inRow.y);
      await waitForFocus(page.locator(view.pane), 'the editor');
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
    } else {
      await page.mouse.click(inRow.x, inRow.y, { clickCount: 3 });
      await waitForFocus(page.locator(view.pane).first(), `the ${view.name}`);
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

  test('shows the viewer, the editor and both sides of the diff every row of a file of control characters as the file has it, their cells drawing each character by its picture in a cell, the bar after them in one column', async () => {
    const found: Record<string, unknown> = {};
    for (const view of cellViews) {
      await show(view);
      const cells = cellsOf(page, view.rows);
      const lines = (
        await untilSettled(() => cells.rows(), `the rows of the ${view.name}`)
      ).map(({ line }) => line);
      found[view.name] = {
        asWritten: [...written, keptWritten]
          .filter((text) => lines.includes(text))
          .map(legible),
        bars: new Set((await cells.glyphs('|')).map(({ column }) => column))
          .size,
      };
    }
    assert.deepStrictEqual(
      found,
      Object.fromEntries(
        cellViews.map((view) => [
          view.name,
          { asWritten: [...written, keptWritten].map(legible), bars: 1 },
        ]),
      ),
    );
  });

  test('copies the control characters as they are out of the viewer, the editor and the diff, the form feed itself, not the picture drawn for it, keeps a picture of it the file itself holds, and copies a row as it is written whatever of it is drawn in a box, as a character shrunk into its box came out with a line break on either side', async () => {
    const found: Record<string, unknown> = {};
    for (const view of cellViews) {
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
        cellViews.map((view) => [
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

  test('draws a form feed and an escape in the editor in the color of the code around them, each in the piece of the string that holds it and drawn once, as the viewer and the diff draw them', async () => {
    await page.locator('.tabs .tab').nth(5).click();
    const cells = cellsOf(page, editor.rows);
    const held = `${formFeed}page${escape}`;
    await waitFor(
      async () =>
        (await cells.rows()).some(({ pieces }) =>
          pieces.some(({ kind }) => kind === 'string'),
        ),
      'the code of the editor colored',
    );
    assert.deepStrictEqual(
      {
        strings: (await cells.rows()).flatMap(({ pieces }) =>
          pieces
            .filter(({ kind }) => kind === 'string')
            .map(({ text }) => legible(text)),
        ),
        drawn: [
          (await cells.glyphs(formFeed)).length,
          (await cells.glyphs(escape)).length,
        ],
      },
      { strings: [legible(held)], drawn: [1, 1] },
    );
  });

  test('shows a file dense in control characters in the editor and the viewer as it is written, every row of it, the bar after the characters of each in one column', async () => {
    const found: Record<string, unknown> = {};
    for (const view of [
      { ...viewer, tab: 7 },
      { ...editor, tab: 6 },
    ]) {
      await show(view, denseLines[0]);
      const cells = cellsOf(page, view.rows);
      const rows = await untilSettled(
        () => cells.rows(),
        `the rows of the ${view.name}`,
      );
      found[view.name] = {
        rows: rows.length >= 20,
        asWritten: rows.every(({ text }, at) => text === denseLines[at]),
        bars: new Set((await cells.glyphs('|')).map(({ column }) => column))
          .size,
      };
    }
    const expected = { rows: true, asWritten: true, bars: 1 };
    assert.deepStrictEqual(found, { viewer: expected, editor: expected });
  });

  test('draws the control characters of a Markdown file previewed by the font too, in its text and in its code, the form feed as its picture', async () => {
    await page.locator('.tabs .tab').nth(4).click();
    const preview = page.locator('.markdown');
    await preview.locator('pre > code').waitFor();
    assert.strictEqual(
      legible(await preview.locator('p').first().textContent()),
      legible(`A bell ${character(7)} in a sentence, fed␌on.`),
    );
    const code = cellsOf(page, '.markdown pre > code .cell-rows');
    await waitFor(
      async () => (await code.rows()).length > 0,
      'the code block drawn',
    );
    assert.strictEqual(
      legible((await code.rows()).map(({ text }) => text).join(lineFeed)),
      legible(`${escape}[0m${character(127)}␌`),
    );
    assert.deepStrictEqual(await fontsDrawing('.markdown p', 'A bell'), [
      `${controlFont} 2`,
    ]);
  });
});
