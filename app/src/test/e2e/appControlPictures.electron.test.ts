import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { waitForFocus } from './waits';

const character = (code: number) => String.fromCharCode(code);
const pictureOf = (code: number) =>
  character(code === 127 ? 0x2421 : 0x2400 + code);
const lineFeed = character(10);
const escape = character(27);

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
const shown = groups.map((codes) =>
  padded(`x ${codes.map(pictureOf).join('')}`),
);
const keptWritten = padded(`kept ␛${escape}`);
const keptShown = padded('kept ␛␛');
const fileOf = (last: string) =>
  [ruler, ...written, keptWritten, last, ''].join(lineFeed);

const views = [
  {
    name: 'viewer',
    tab: 1,
    pane: '.viewer-body',
    rows: '.viewer-rows .viewer-row',
  },
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

type View = (typeof views)[number];

interface DrawnRow {
  readonly text: string;
  readonly bar: number | undefined;
}

function drawnRows(selector: string): DrawnRow[] {
  return [...document.querySelectorAll(selector)].map((row) => {
    let text = '';
    let bar: number | undefined;
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('[aria-hidden="true"]')) {
        continue;
      }
      const part = node.textContent ?? '';
      const at = part.lastIndexOf('|');
      if (at !== -1) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        bar = range.getBoundingClientRect().left;
      }
      text += part;
    }
    return { text, bar };
  });
}

function selectRow([selector, text]: readonly [string, string]): boolean {
  const row = [...document.querySelectorAll(selector)].find((each) =>
    (each.textContent ?? '').includes(text),
  );
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

const legible = (text: unknown) =>
  typeof text === 'string'
    ? text.replace(/[^ -~]/g, (each) => `<${each.charCodeAt(0).toString(16)}>`)
    : text;

suite('App control pictures', () => {
  let app: ElectronApplication;
  let page: Page;

  const show = async (view: View) => {
    await page.locator('.tabs .tab').nth(view.tab).click();
    await waitFor(
      async () =>
        (await page.evaluate(drawnRows, view.rows)).some(
          (row) => row.text === ruler,
        ),
      `the ruler in the ${view.name}`,
    );
  };

  const copiedFrom = async (view: View, row: string) => {
    await show(view);
    if (view.name === 'editor') {
      await page.locator(view.rows, { hasText: row.slice(0, 6) }).click();
      await waitForFocus(page.locator(view.pane), 'the editor');
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
    } else {
      await page.locator(view.pane).first().focus();
      assert.ok(
        await page.evaluate(selectRow, [view.rows, row.slice(0, 6)] as const),
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
        `A bell ${character(7)} in a sentence.`,
        '',
        '```',
        `${escape}[0m${character(127)}`,
        '```',
        '',
      ].join(lineFeed),
    );
    const code = path.join(opened, 'colored.ts');
    fs.writeFileSync(
      code,
      `export const bell = '${escape}ring${character(7)}';${lineFeed}`,
    );
    const dense = path.join(opened, 'dense.txt');
    fs.writeFileSync(
      dense,
      Array.from({ length: 40 }, () => `x${escape.repeat(20)}|`).join(lineFeed),
    );
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

  test('draws every control character as its picture in the viewer, the editor and both sides of the diff, each a column wide, the form feed, the group separator and the delete too, which Chromium drew as nothing or narrower, so the bar after them stands under the bar of the ruler', async () => {
    const found: Record<string, unknown> = {};
    for (const view of views) {
      await show(view);
      const rows = await page.evaluate(drawnRows, view.rows);
      const bars = new Set(
        rows
          .filter((row) => row.bar !== undefined)
          .map((row) => Math.round((row.bar ?? 0) * 100) / 100),
      );
      found[view.name] = {
        drawn: [...shown, keptShown].filter((text) =>
          rows.some((row) => row.text === text),
        ),
        bars: bars.size,
      };
    }
    assert.deepStrictEqual(
      found,
      Object.fromEntries(
        views.map((view) => [
          view.name,
          { drawn: [...shown, keptShown], bars: 1 },
        ]),
      ),
    );
  });

  test('copies the control characters themselves out of the viewer, the editor and the diff, not the pictures drawn for them, and keeps a picture the file itself holds', async () => {
    const found: Record<string, unknown> = {};
    for (const view of views) {
      found[view.name] = [
        legible(await copiedFrom(view, shown[0] ?? '')),
        legible(await copiedFrom(view, keptShown)),
      ];
    }
    assert.deepStrictEqual(
      found,
      Object.fromEntries(
        views.map((view) => [
          view.name,
          [legible(written[0]), legible(keptWritten)],
        ]),
      ),
    );
  });

  test('draws a picture of the editor in the color of the code around it, inside the span that colors it, as the viewer and the diff do, where it stood outside in the color of plain text', async () => {
    await page.locator('.tabs .tab').nth(5).click();
    const pictures = page.locator('.editor .cm-line span', {
      hasText: /^[␛␇]$/,
    });
    await page.locator('.editor .cm-line .syntax-string').first().waitFor();
    await pictures.first().waitFor();
    assert.deepStrictEqual(
      await pictures.evaluateAll((drawn) =>
        drawn.map((each) => [
          each.textContent,
          each.parentElement?.className,
          getComputedStyle(each).color ===
            getComputedStyle(each.parentElement ?? each).color,
        ]),
      ),
      [
        ['␛', 'syntax-string', true],
        ['␇', 'syntax-string', true],
      ],
    );
  });

  test('leaves a file of more than eight control characters a line as it is in the editor, where an element for each picture took longer to paint at every frame than the characters took to lay out', async () => {
    await page.locator('.tabs .tab').nth(6).click();
    const line = page.locator('.editor .cm-line').first();
    await waitFor(
      async () => ((await line.textContent()) ?? '').endsWith('|'),
      'the dense file in the editor',
    );
    assert.strictEqual(await line.textContent(), `x${escape.repeat(20)}|`);
    assert.strictEqual(await line.locator('span').count(), 0);
  });

  test('draws the control characters of a Markdown file previewed as their pictures, in its text and in its code', async () => {
    await page.locator('.tabs .tab').nth(4).click();
    const preview = page.locator('.markdown');
    await preview.locator('pre > code').waitFor();
    assert.strictEqual(
      await preview.locator('p').first().textContent(),
      'A bell ␇ in a sentence.',
    );
    assert.strictEqual(
      (await preview.locator('pre > code').textContent())?.trimEnd(),
      '␛[0m␡',
    );
  });
});
