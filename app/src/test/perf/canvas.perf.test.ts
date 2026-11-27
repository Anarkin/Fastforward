import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { launchedForPerf, measure } from './perfFixtures';
import { dragged, sleep, wheelNotches } from './perfInput';

const across = 40;
const down = 25;
const cell = { width: 7, height: 18 };
const idOf = (column: number, row: number) => `n${column}-${row}`;

function bigBoard(): string {
  const nodes = Array.from({ length: across * down }, (_, at) => {
    const column = at % across;
    const row = Math.floor(at / across);
    return {
      id: idOf(column, row),
      type: 'text',
      text: `Node ${at + 1}\nrow ${row + 1}, column ${column + 1}`,
      x: column * 26 * cell.width,
      y: row * 7 * cell.height,
      width: 20 * cell.width,
      height: 4 * cell.height,
    };
  });
  const edges = nodes.flatMap((node, at) => {
    const column = at % across;
    const row = Math.floor(at / across);
    return [
      ...(column + 1 < across
        ? [
            {
              id: `a${node.id}`,
              fromNode: node.id,
              toNode: idOf(column + 1, row),
            },
          ]
        : []),
      ...(row + 1 < down
        ? [
            {
              id: `d${node.id}`,
              fromNode: node.id,
              toNode: idOf(column, row + 1),
            },
          ]
        : []),
    ];
  });
  return JSON.stringify({ nodes, edges });
}

suite('Frames of a canvas of 1,000 nodes', () => {
  const folder = tempFolder('perf-canvas');
  const board = path.join(folder, 'big.canvas');
  fs.writeFileSync(board, bigBoard());
  afterAll(() => removeFolder(folder));
  const perf = launchedForPerf(
    {
      state: {
        tabs: [{ id: '1', tool: 'canvas', root: board }],
        activeTab: '1',
      },
      settings: {},
    },
    (page) => page.locator('.board-host canvas').first().waitFor(),
  );

  test('panned by the wheel', async () => {
    const { page } = perf();
    await sleep(1500);
    const result = await measure(perf(), 'canvas: wheel down', () =>
      wheelNotches(page, page.locator('.board-host'), 20),
    );
    assert.ok(result.frames.updates > 0, String(result.frames.updates));
  });

  test('a node dragged across', async () => {
    const { page } = perf();
    await page.locator('.board-body').focus();
    await page.keyboard.press('Home');
    await sleep(800);
    const host = page.locator('.board-host');
    const box = await host.boundingBox();
    const seen = await host.evaluate((element: HTMLElement) =>
      element.seenBoard?.(),
    );
    const ratio = await page.evaluate(() => devicePixelRatio);
    assert.ok(box !== null && seen !== undefined);
    const from = {
      x: box.x + (10 - seen.origin.column + 0.5) * (seen.advance / ratio),
      y: box.y + (2 - seen.origin.row + 0.5) * (seen.rowHeight / ratio),
    };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await sleep(300);
    const result = await measure(perf(), 'canvas: node dragged', () =>
      dragged(page, from, { x: 300, y: 120 }),
    );
    await page.mouse.up();
    assert.ok(result.frames.updates > 0, String(result.frames.updates));
  });
});
