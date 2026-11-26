import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { showTab } from './tabReturns';
import { onceDrawn, untilSettled, waitForFocus } from './waits';

async function pixelsOf(
  page: Page,
  shot: Buffer,
  points: readonly (readonly [number, number])[],
): Promise<string[]> {
  return page.evaluate(
    async ({ data, at }) => {
      const bytes = Uint8Array.from(atob(data), (each) => each.charCodeAt(0));
      const image = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' }),
      );
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context?.drawImage(image, 0, 0);
      return at.map(([x, y]) =>
        Array.from(context?.getImageData(x, y, 1, 1).data ?? []).join(','),
      );
    },
    { data: shot.toString('base64'), at: points },
  );
}

const cellOfFont = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'board-probe-row';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const context = new OffscreenCanvas(0, 0).getContext('2d');
    if (context === null) {
      throw new Error('No canvas to measure with');
    }
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const cell = {
      width: Math.round(context.measureText('0').width),
      height: Math.round(parseFloat(style.lineHeight)),
    };
    probe.remove();
    return cell;
  });

interface Placed {
  readonly column: number;
  readonly row: number;
}

const whole = (origin: Placed | undefined): origin is Placed =>
  origin !== undefined &&
  Number.isInteger(origin.column) &&
  Number.isInteger(origin.row);

suite('App canvas', () => {
  let folder: string;
  let board: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-canvas');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile);
    board = path.join(folder, 'plan.canvas');
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: folder },
          { id: '2', tool: 'canvas', root: board },
        ],
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('draws the nodes of a canvas as boxes of box-drawing characters on the cells of the monospace font over a grid of dots where the cells meet, an edge leaving one from a joint and pointing at the top of the other, every line and dot one stroke of whole device pixels', async () => {
    await page.locator('.commander-pane').first().waitFor();
    const unit = await cellOfFont(page);
    const at = (
      column: number,
      row: number,
      columns: number,
      rows: number,
    ) => ({
      x: column * unit.width,
      y: row * unit.height,
      width: columns * unit.width,
      height: rows * unit.height,
    });
    fs.writeFileSync(
      board,
      JSON.stringify({
        nodes: [
          { id: 'idea', type: 'text', text: 'Idea', ...at(0, 0, 10, 3) },
          { id: 'plan', type: 'text', text: 'Plan', ...at(10, 4, 10, 3) },
        ],
        edges: [
          {
            id: 'e',
            fromNode: 'idea',
            fromSide: 'right',
            toNode: 'plan',
            toSide: 'top',
          },
        ],
      }),
    );
    await showTab(page, 1);
    const host = page.locator('.board-host');
    const seen = await untilSettled(
      () => host.evaluate((element: HTMLElement) => element.seenBoard?.()),
      'the canvas drawn',
      {
        accepted: (drawn) =>
          drawn?.rows.some((row) => row.includes('Idea')) === true,
      },
    );
    assert.ok(seen !== undefined);
    assert.deepStrictEqual(seen.rows.slice(0, 9), [
      '',
      '  ┌────────┐',
      '  │ Idea   ├────┐',
      '  └────────┘    │',
      '                ▼',
      '            ┌────────┐',
      '            │ Plan   │',
      '            └────────┘',
      '',
    ]);
    await onceDrawn(page);
    const placed = await host.evaluate((element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, ratio: devicePixelRatio };
    });
    const { advance, rowHeight, stroke } = seen;
    const left = Math.round(placed.left * placed.ratio);
    const top = Math.round(placed.top * placed.ratio);
    const x = left + 2 * advance + Math.floor((advance - stroke) / 2);
    const y = top + rowHeight + Math.floor((rowHeight - stroke) / 2);
    const [corner, above, along, below, inside, dot, beside] = await pixelsOf(
      page,
      await page.screenshot(),
      [
        [x, y],
        [x, y - 1],
        [x + advance, y + stroke - 1],
        [x + advance, y + stroke],
        [x + 7 * advance, y + rowHeight],
        [left + advance, top + rowHeight],
        [left + advance + 1, top + rowHeight + 1],
      ],
    );
    assert.notStrictEqual(corner, inside, 'the corner drawn');
    assert.deepStrictEqual(
      [above, along, below],
      [inside, corner, inside],
      'the top border one stroke tall, from the corner on',
    );
    assert.notStrictEqual(dot, inside, 'a dot of the grid where cells meet');
    assert.strictEqual(beside, inside, 'the grid a dot of one stroke');
  });

  const seenBoard = () =>
    page
      .locator('.board-host')
      .evaluate((element: HTMLElement) => element.seenBoard?.());

  const settledOrigin = async (
    moved: (origin: Placed) => boolean = () => true,
  ): Promise<Placed> => {
    const seen = await untilSettled(
      seenBoard,
      'the canvas settled on whole cells from its top left',
      {
        accepted: (drawn) =>
          whole(drawn?.origin) &&
          drawn.shift.x === 0 &&
          drawn.shift.y === 0 &&
          moved(drawn.origin),
      },
    );
    assert.ok(whole(seen?.origin));
    return seen.origin;
  };

  const cellSize = async () => {
    const seen = await seenBoard();
    const ratio = await page.evaluate(() => devicePixelRatio);
    assert.ok(seen !== undefined);
    return { width: seen.advance / ratio, height: seen.rowHeight / ratio };
  };

  const middleOfBoard = async () => {
    const box = await page.locator('.board-body').boundingBox();
    assert.ok(box !== null);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  test('moves around a canvas by the wheel, down the rows of a notch and settling on whole cells', async () => {
    const before = await settledOrigin();
    const { x, y } = await middleOfBoard();
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 100);
    const after = await settledOrigin((origin) => origin.row > before.row);
    assert.strictEqual(after.column, before.column);
  });

  test('moves around a canvas dragged by the middle button, a cell for every cell of the way, settling on whole cells once let go', async () => {
    const before = await settledOrigin();
    const cell = await cellSize();
    const { x, y } = await middleOfBoard();
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(x - 10.4 * cell.width, y - 3.3 * cell.height, {
      steps: 6,
    });
    await page.mouse.up({ button: 'middle' });
    const after = await settledOrigin(
      (origin) => origin.column !== before.column,
    );
    assert.deepStrictEqual(after, {
      column: before.column + 10,
      row: before.row + 3,
    });
  });

  test('moves around a canvas dragged while Space is held, and comes back where it was moved to once its tab is shown again', async () => {
    const before = await settledOrigin();
    const cell = await cellSize();
    const { x, y } = await middleOfBoard();
    await page.mouse.click(x, y);
    await waitForFocus(page.locator('.board-body'), 'the canvas');
    await page.keyboard.down('Space');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 4 * cell.width, y + 2 * cell.height, {
      steps: 4,
    });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const after = await settledOrigin((origin) => origin.row !== before.row);
    assert.deepStrictEqual(after, {
      column: before.column - 4,
      row: before.row - 2,
    });
    await showTab(page, 0);
    await showTab(page, 1);
    assert.deepStrictEqual(await settledOrigin(), after);
  });

  test('settles a drag on whole cells once its pointer is taken from the canvas without being let go, as when the button comes up outside the window, following it no further', async () => {
    const before = await settledOrigin();
    const cell = await cellSize();
    const { x, y } = await middleOfBoard();
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(x - 5.4 * cell.width, y, { steps: 4 });
    await page
      .locator('.board-body')
      .evaluate((element: HTMLElement) => element.releasePointerCapture(1));
    await page.mouse.move(x - 9 * cell.width, y);
    const after = await settledOrigin(
      (origin) => origin.column !== before.column,
    );
    await page.mouse.up({ button: 'middle' });
    assert.deepStrictEqual(after, {
      column: before.column + 5,
      row: before.row,
    });
  });
});
