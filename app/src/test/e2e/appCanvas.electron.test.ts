import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { showTab } from './tabReturns';
import { onceDrawn, untilSettled } from './waits';

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

  test('draws the nodes of a canvas as boxes of box-drawing characters on the cells of the monospace font, an edge leaving one from a joint and pointing at the top of the other, every line one stroke of whole device pixels', async () => {
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
    const [corner, above, along, below, inside] = await pixelsOf(
      page,
      await page.screenshot(),
      [
        [x, y],
        [x, y - 1],
        [x + advance, y + stroke - 1],
        [x + advance, y + stroke],
        [x + 7 * advance, y + rowHeight],
      ],
    );
    assert.notStrictEqual(corner, inside, 'the corner drawn');
    assert.deepStrictEqual(
      [above, along, below],
      [inside, corner, inside],
      'the top border one stroke tall, from the corner on',
    );
  });
});
