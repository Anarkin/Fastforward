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

  test('draws a canvas inside the frame of its column, so the line of the frame covers none of the cells at its edges, as it covered the left of the first letter of a canvas moved to its edge', async () => {
    const placed = await page.evaluate(() => {
      const column = document.querySelector('.column.board');
      const canvas = document.querySelector('.board-canvas');
      if (column === null || canvas === null) {
        return undefined;
      }
      const line = parseFloat(
        getComputedStyle(column).getPropertyValue('--column-line'),
      );
      const frame = column.getBoundingClientRect();
      const drawn = canvas.getBoundingClientRect();
      return {
        left: drawn.left - frame.left - line,
        right: frame.right - line - drawn.right,
        bottom: frame.bottom - line - drawn.bottom,
      };
    });
    assert.ok(placed !== undefined);
    for (const [edge, room] of Object.entries(placed)) {
      assert.ok(room > -0.01, `${edge} ${room}`);
    }
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

  const pointAt = async (cell: Placed) => {
    const seen = await seenBoard();
    const box = await page.locator('.board-host').boundingBox();
    const ratio = await page.evaluate(() => devicePixelRatio);
    assert.ok(seen !== undefined && box !== null);
    return {
      x:
        box.x +
        (cell.column - seen.origin.column + 0.5) * (seen.advance / ratio),
      y: box.y + (cell.row - seen.origin.row + 0.5) * (seen.rowHeight / ratio),
    };
  };

  const drawnAt = async (cell: Placed) => {
    const seen = await seenBoard();
    const row = seen?.rows[cell.row - (seen?.row ?? 0)] ?? '';
    return row.charAt(cell.column - (seen?.column ?? 0)) || ' ';
  };

  const shows = (what: string, cell: Placed, drawn: string) =>
    untilSettled(() => drawnAt(cell), what, {
      accepted: (seen) => seen === drawn,
    });

  const holds = (what: string, text: string, wanted: boolean) =>
    untilSettled(
      async () => (await seenBoard())?.rows.some((row) => row.includes(text)),
      what,
      { accepted: (seen) => seen === wanted },
    );

  const savedNodes = () => {
    const saved: unknown = JSON.parse(fs.readFileSync(board, 'utf8'));
    assert.ok(typeof saved === 'object' && saved !== null && 'nodes' in saved);
    assert.ok(Array.isArray(saved.nodes));
    return saved.nodes.flatMap((node: unknown) =>
      typeof node === 'object' &&
      node !== null &&
      'id' in node &&
      'x' in node &&
      'y' in node
        ? [{ id: node.id, x: node.x, y: node.y }]
        : [],
    );
  };

  const savedText = (id: string) => {
    const saved: unknown = JSON.parse(fs.readFileSync(board, 'utf8'));
    assert.ok(typeof saved === 'object' && saved !== null && 'nodes' in saved);
    assert.ok(Array.isArray(saved.nodes));
    const found: unknown = saved.nodes.find(
      (node: unknown) =>
        typeof node === 'object' &&
        node !== null &&
        'id' in node &&
        node.id === id,
    );
    return typeof found === 'object' && found !== null && 'text' in found
      ? found.text
      : undefined;
  };

  const cursorShown = (what: string, wanted: boolean) =>
    untilSettled(() => page.locator('.board-cursor').count(), what, {
      accepted: (count) => (count === 1) === wanted,
    });

  const savedEdges = () => {
    const saved: unknown = JSON.parse(fs.readFileSync(board, 'utf8'));
    assert.ok(typeof saved === 'object' && saved !== null && 'edges' in saved);
    assert.ok(Array.isArray(saved.edges));
    return saved.edges.flatMap((edge: unknown) =>
      typeof edge === 'object' &&
      edge !== null &&
      'fromNode' in edge &&
      'fromSide' in edge &&
      'toSide' in edge
        ? [
            `${String(edge.fromNode)} ${String(edge.fromSide)} ${String(edge.toSide)}`,
          ]
        : [],
    );
  };

  const panTo = async (wanted: Placed) => {
    const now = await settledOrigin();
    const cell = await cellSize();
    const { x, y } = await middleOfBoard();
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(
      x + (now.column - wanted.column) * cell.width,
      y + (now.row - wanted.row) * cell.height,
      { steps: 4 },
    );
    await page.mouse.up({ button: 'middle' });
    await settledOrigin(
      (origin) => origin.column === wanted.column && origin.row === wanted.row,
    );
  };

  test('selects a node clicked, drawing it in double lines, moves it dragged a cell at a time with its tab marked unsaved, and writes where it went into its file on Mod+S', async () => {
    await panTo({ column: -2, row: -1 });
    const unit = await cellOfFont(page);
    const inside = await pointAt({ column: 3, row: 1 });
    await page.mouse.click(inside.x, inside.y);
    await shows('the node selected', { column: 0, row: 0 }, '╔');
    const from = await pointAt({ column: 3, row: 1 });
    const to = await pointAt({ column: 7, row: 2 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
    await shows('the node moved', { column: 4, row: 1 }, '╔');
    const unsaved = page.locator(
      'nav.tabs [role="tab"][aria-selected="true"] .tab-unsaved',
    );
    await unsaved.waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await unsaved.waitFor({ state: 'detached' });
    assert.deepStrictEqual(
      savedNodes().find((node) => node.id === 'idea'),
      { id: 'idea', x: 4 * unit.width, y: unit.height },
    );
  });

  test('places a text node where the pointer is on Mod+1 and a click, selected, and deletes the nodes selected on Delete with their edges, bringing them back on Mod+Z', async () => {
    const spot = await pointAt({ column: 30, row: 2 });
    await page.mouse.move(spot.x, spot.y);
    await page.keyboard.press('ControlOrMeta+1');
    await page.mouse.click(spot.x, spot.y);
    await shows('the node placed, selected', { column: 30, row: 2 }, '╔');
    const idea = await pointAt({ column: 7, row: 2 });
    await page.mouse.click(idea.x, idea.y);
    await shows('the node selected', { column: 4, row: 1 }, '╔');
    await page.keyboard.press('Delete');
    await holds('the node deleted', 'Idea', false);
    assert.strictEqual(await drawnAt({ column: 14, row: 2 }), ' ');
    await page.keyboard.press('ControlOrMeta+Z');
    await holds('the node back', 'Idea', true);
  });

  test('selects the nodes a box drawn over the empty canvas touches', async () => {
    const corner = await pointAt({ column: -1, row: -1 });
    const across = await pointAt({ column: 12, row: 5 });
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(across.x, across.y, { steps: 5 });
    await page.mouse.up();
    await shows('the first node selected', { column: 4, row: 1 }, '╔');
    await shows('the second node selected', { column: 10, row: 4 }, '╔');
  });

  test('moves a group dragged by its top, with the node it holds whole', async () => {
    const corner = await pointAt({ column: 30, row: 0 });
    await page.mouse.move(corner.x, corner.y);
    await page.keyboard.press('ControlOrMeta+2');
    await page.mouse.click(corner.x, corner.y);
    await shows('the group placed, selected', { column: 30, row: 0 }, '╔');
    const top = await pointAt({ column: 40, row: 0 });
    const lower = await pointAt({ column: 40, row: 3 });
    await page.mouse.move(top.x, top.y);
    await page.mouse.down();
    await page.mouse.move(lower.x, lower.y, { steps: 4 });
    await page.mouse.up();
    await shows('the group moved', { column: 30, row: 3 }, '╔');
    await shows('the node it holds moved with it', { column: 30, row: 5 }, '┌');
  });

  test('types into a text node double-clicked where it was clicked, drawing the cursor there, stops on Escape with the node still selected and writes what was typed into its file on Mod+S', async () => {
    const letter = await pointAt({ column: 14, row: 5 });
    await page.mouse.dblclick(letter.x, letter.y);
    await cursorShown('the cursor drawn', true);
    await page.keyboard.type('X');
    await holds('the letter typed', 'PlXan', true);
    await page.keyboard.press('Escape');
    await cursorShown('the cursor gone', false);
    await shows('the node still selected', { column: 10, row: 4 }, '╔');
    const unsaved = page.locator(
      'nav.tabs [role="tab"][aria-selected="true"] .tab-unsaved',
    );
    await unsaved.waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await unsaved.waitFor({ state: 'detached' });
    assert.strictEqual(savedText('plan'), 'PlXan');
  });

  test('types at the end of the text node selected on Enter, deletes on Backspace, and takes back a whole typing at once on Mod+Z', async () => {
    await page.keyboard.press('Enter');
    await cursorShown('the cursor drawn', true);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await holds('two letters deleted', 'PlX', true);
    await holds('the letters gone', 'PlXan', false);
    await page.keyboard.press('ControlOrMeta+Z');
    await holds('the typing taken back whole', 'PlXan', true);
    await cursorShown('the cursor gone', false);
    await page.keyboard.press('ControlOrMeta+Z');
    await holds('the typing before it taken back', 'Plan', true);
  });

  test('types into a text node placed at once', async () => {
    const spot = await pointAt({ column: 2, row: 12 });
    await page.mouse.move(spot.x, spot.y);
    await page.keyboard.press('ControlOrMeta+1');
    await page.mouse.click(spot.x, spot.y);
    await cursorShown('the cursor drawn in the node placed', true);
    await page.keyboard.type('Hello there');
    await holds('the words typed', 'Hello there', true);
    await page.keyboard.press('Escape');
    await cursorShown('the cursor gone', false);
  });

  test('marks the middle of each side of the node under the pointer, joins it to another node by an edge dragged from a mark, the side nearest the pointer, selected and saved, and deletes an edge clicked on Delete', async () => {
    const plan = await pointAt({ column: 14, row: 5 });
    await page.mouse.move(plan.x, plan.y);
    await shows('the mark below the node', { column: 14, row: 7 }, '●');
    const mark = await pointAt({ column: 14, row: 7 });
    const target = await pointAt({ column: 15, row: 13 });
    await page.mouse.move(mark.x, mark.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 5 });
    await page.mouse.up();
    await shows('the edge drawn selected', { column: 14, row: 8 }, '║');
    await page.keyboard.press('ControlOrMeta+S');
    await untilSettled(() => Promise.resolve(savedEdges()), 'the edge saved', {
      accepted: (edges) => edges.includes('plan bottom top'),
    });
    const empty = await pointAt({ column: 40, row: 20 });
    await page.mouse.click(empty.x, empty.y);
    await shows('the edge no longer selected', { column: 14, row: 8 }, '│');
    const line = await pointAt({ column: 14, row: 8 });
    await page.mouse.click(line.x, line.y);
    await shows('the edge selected by a click', { column: 14, row: 8 }, '║');
    await page.keyboard.press('Delete');
    await shows('the edge deleted', { column: 14, row: 8 }, ' ');
  });
});
