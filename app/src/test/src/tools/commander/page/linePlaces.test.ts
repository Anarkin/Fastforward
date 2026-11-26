import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  lineBoxOf,
  locatedLine,
  locatedTile,
  tileBoxOf,
} from '../../../../../tools/commander/page/linePlaces';

const list = (scrollTop: number) => ({
  getBoundingClientRect: () => ({
    left: 100,
    top: 50,
    right: 900,
    bottom: 650,
    width: 800,
    height: 600,
  }),
  clientLeft: 1,
  clientTop: 1,
  clientWidth: 780,
  clientHeight: 598,
  scrollTop,
});

const grid = {
  height: 200,
  width: 160,
  across: 4,
  count: 30,
  check: { left: 4, top: 4, size: 16 },
};

suite('Commander places', () => {
  test('finds the line under a point of a list scrolled down, inside its border, and none past the last line or outside the list', () => {
    const scrolled = list(40);
    assert.strictEqual(
      locatedLine(scrolled, { x: 300, y: 51 + 20 * 3 - 40 + 5 }, 20, 10)?.index,
      3,
    );
    assert.strictEqual(
      locatedLine(scrolled, { x: 300, y: 51 + 20 * 12 }, 20, 10),
      undefined,
    );
    assert.strictEqual(
      locatedLine(scrolled, { x: 50, y: 100 }, 20, 10),
      undefined,
    );
    assert.deepStrictEqual(lineBoxOf(scrolled, 3, 20), {
      left: 101,
      top: 51 + 60 - 40,
      bottom: 51 + 80 - 40,
    });
  });

  test('finds the tile under a point by its row and column of the grid, telling a point on its box from one past it, and puts the menu of a tile below that tile', () => {
    const scrolled = list(100);
    const at = (x: number, y: number) => locatedTile(scrolled, { x, y }, grid);
    const row = 51 + 200 - 100;
    assert.deepStrictEqual(
      [
        at(101 + 160 * 2 + 50, row + 50)?.index,
        at(101 + 160 * 2 + 50, row + 50)?.overCheck,
      ],
      [6, false],
    );
    assert.strictEqual(at(101 + 160 * 2 + 10, row + 10)?.overCheck, true);
    assert.strictEqual(at(101 + 160 * 4 + 10, row + 10), undefined);
    assert.deepStrictEqual(tileBoxOf(scrolled, 6, 200, 160, 4), {
      left: 101 + 320,
      top: row,
      bottom: row + 200,
    });
  });
});
