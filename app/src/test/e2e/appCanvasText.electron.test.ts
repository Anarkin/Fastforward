import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { dragOver, seenRows } from './cellsSeen';
import {
  inkSeen,
  leastInk,
  mostUnlike,
  unlikeCells,
  unlikeShare,
  unlikeWhere,
  type Box,
  type Seen,
} from './inkAlike';
import { untilSettled } from './waits';

const pig = '\u{1F437}';

const lines = [
  'API server #3',
  `Node.js${pig}asd 中文\tend`,
  "const controls = 'a\u0001b\u001bc\u007fd';",
  '  two  spaces, ｆｕｌｌ and 한국어',
  'a flag \u{1F1ED}\u{1F1FA}, a family \u{1F468}‍\u{1F469}‍\u{1F467} and a keycap 1️⃣',
  `selected from here to past the right of what is compared ${'x'.repeat(40)}`,
];

const selectedRow = 5;

const selectedFrom = 13;

const selectedTo = 60;

const comparedColumns = 40;

const nodeColumn = 2;

const nodeRow = 1;

suite('App canvas text', () => {
  let app: ElectronApplication;
  let page: Page;

  const show = (tab: number) => page.locator('.tabs .tab').nth(tab).click();

  const board = async () => {
    const host = page.locator('.board-host').first();
    const seen = await host.evaluate((element: HTMLElement) =>
      element.seenBoard?.(),
    );
    const box = await host.boundingBox();
    const ratio = await page.evaluate(() => devicePixelRatio);
    assert.ok(seen !== undefined && box !== null, 'the canvas drew nothing');
    const at = (column: number, row: number) => ({
      x: box.x + ((column - seen.column) * seen.advance - seen.shift.x) / ratio,
      y: box.y + ((row - seen.row) * seen.rowHeight - seen.shift.y) / ratio,
    });
    return { seen, ratio, at };
  };

  const canvasText = async (): Promise<Box> => {
    const { seen, ratio, at } = await board();
    const start = at(nodeColumn, nodeRow);
    const host = await page.locator('.board-host').first().boundingBox();
    assert.ok(host !== null, 'the canvas has no box');
    return {
      left:
        host.x +
        Math.round((nodeColumn - seen.column) * seen.advance - seen.shift.x) /
          ratio,
      top: start.y,
      width: (comparedColumns * seen.advance) / ratio,
      height: (lines.length * seen.rowHeight) / ratio,
    };
  };

  const viewedText = async (): Promise<Box> => {
    const [row] = await seenRows(page);
    assert.ok(row, 'the viewer draws no row');
    return {
      left: row.left - row.column * row.advance,
      top: row.top,
      width: comparedColumns * row.advance,
      height: lines.length * row.height,
    };
  };

  const settled = async (box: () => Promise<Box>, what: string) => {
    let last: Seen = await inkSeen(app, page, await box());
    await untilSettled(async () => {
      last = await inkSeen(app, page, await box());
      return last.hash;
    }, what);
    return last;
  };

  const inCanvas = async (column: number, row: number) => {
    const { seen, ratio, at } = await board();
    const corner = at(nodeColumn + column, nodeRow + row);
    return {
      x: corner.x + seen.advance / ratio / 2,
      y: corner.y + seen.rowHeight / ratio / 2,
    };
  };

  beforeAll(async () => {
    const folder = tempFolder('canvas-text');
    const profile = path.join(folder, 'profile');
    const file = path.join(folder, 'opened', 'lines.txt');
    const canvas = path.join(folder, 'opened', 'lines.canvas');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(file, lines.join('\n'));
    fs.writeFileSync(
      canvas,
      JSON.stringify({
        nodes: [
          {
            id: 'lines',
            type: 'text',
            text: lines.join('\n'),
            x: 0,
            y: 0,
            width: 140 * 7,
            height: 12 * 18,
          },
        ],
        edges: [],
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'viewer', root: file },
          { id: '2', tool: 'canvas', root: canvas },
          { id: '3', tool: 'editor', root: file },
        ],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({
        scrolling: { smooth: false },
        text: { wordWrap: false, highlightOccurrences: false },
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await waitFor(
      async () => (await seenRows(page)).length >= lines.length,
      'the viewer drawn',
    );
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  test('draws the text of a node of a canvas as the viewer draws the same text, alike to the brightness of every pixel but for the edges of glyphs: whitespace shown, a tab to its stop, wide characters, an emoji, a flag, a family and a keycap on two cells, control characters as their signs and a selection in its color', async () => {
    await show(0);
    await dragOver(
      page,
      [selectedRow, selectedFrom],
      [selectedRow, selectedTo],
    );
    const viewed = await settled(viewedText, 'the viewer drawn at rest');
    await show(1);
    await page.locator('.board-host canvas').first().waitFor();
    const from = await inCanvas(selectedFrom, selectedRow);
    await page.mouse.dblclick(from.x, from.y);
    await page.keyboard.press('Home');
    for (let step = 0; step < selectedFrom; step++) {
      await page.keyboard.press('ArrowRight');
    }
    for (let step = selectedFrom; step < selectedTo; step++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    const drawn = await settled(canvasText, 'the canvas drawn at rest');
    const cellsApart = unlikeCells(
      viewed,
      drawn,
      comparedColumns,
      lines.length,
    ).map((at) => [Math.floor(at / comparedColumns), at % comparedColumns]);

    assert.deepStrictEqual(
      {
        viewerInked: viewed.inked > leastInk,
        canvasInked: drawn.inked > leastInk,
        cellsApart,
        pixelsAlike:
          viewed.phase !== drawn.phase ||
          unlikeShare(viewed, drawn) < mostUnlike,
      },
      {
        viewerInked: true,
        canvasInked: true,
        cellsApart: [],
        pixelsAlike: true,
      },
      `${unlikeShare(viewed, drawn)} of the ink unlike, the text starting ${viewed.phase} and ${drawn.phase} of a device pixel in, most unlike in the cells ${unlikeWhere(viewed, drawn, comparedColumns, lines.length)}`,
    );
    await page.keyboard.press('Escape');
  });

  test('draws the cursor of a node of a canvas over a wide character as the editor draws it, two cells wide', async () => {
    await show(2);
    await page.locator('.editor .editor-cursor-primary').first().waitFor();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ArrowDown');
    for (let step = 0; step < 7; step++) {
      await page.keyboard.press('ArrowRight');
    }
    const editorCursor = await untilSettled(
      async () =>
        (await page.locator('.editor .editor-cursor-primary').boundingBox())
          ?.width,
      'the cursor of the editor on the emoji',
    );
    await show(1);
    await page.locator('.board-host canvas').first().waitFor();
    const before = await inCanvas(7, 1);
    await page.mouse.dblclick(before.x - 1, before.y);
    const canvasCursor = await untilSettled(
      async () => (await page.locator('.board-cursor').boundingBox())?.width,
      'the cursor of the canvas on the emoji',
    );
    const { seen, ratio } = await board();

    assert.deepStrictEqual(
      [editorCursor, canvasCursor].map((width) =>
        Math.round(((width ?? 0) * ratio) / seen.advance),
      ),
      [2, 2],
    );
    await page.keyboard.press('Escape');
  });
});
