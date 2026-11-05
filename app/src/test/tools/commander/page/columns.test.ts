import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  columnAt,
  columnsOf,
  shownWithin,
} from '../../../../tools/commander/page/columns';

const tab = String.fromCharCode(9);

suite('Columns of the rows of a file viewed', () => {
  test('counts a character a column, a tab to the next stop of four, and a character outside the basic plane as one', () => {
    assert.strictEqual(columnsOf('abc'), 3);
    assert.strictEqual(columnsOf(`a${tab}b`), 5);
    assert.strictEqual(columnsOf(`${tab}${tab}`), 8);
    assert.strictEqual(columnsOf('a😀b'), 3);
    assert.strictEqual(columnAt(`a${tab}bc`, 2), 4);
    assert.strictEqual(columnAt('a😀b', 3), 2);
  });

  test('finds the characters a range of columns shows, from a tab stop, so the tabs after it stop where they would in the whole row', () => {
    const plain = 'x'.repeat(1000);
    assert.deepStrictEqual(shownWithin(plain, 0, 1000, 400, 700), {
      from: 400,
      to: 700,
      column: 400,
    });
    assert.deepStrictEqual(shownWithin(plain, 0, 1000, 0, 300), {
      from: 0,
      to: 300,
      column: 0,
    });
    assert.deepStrictEqual(shownWithin(plain, 0, 1000, 1200, 1500), {
      from: 1000,
      to: 1000,
      column: 1000,
    });
    const tabbed = `ab${tab}cdefgh${tab}ij`;
    assert.deepStrictEqual(shownWithin(tabbed, 0, tabbed.length, 4, 9), {
      from: 3,
      to: 8,
      column: 4,
    });
    assert.deepStrictEqual(shownWithin(tabbed, 0, tabbed.length, 8, 12), {
      from: 7,
      to: 10,
      column: 8,
    });
  });

  test('counts a character as wide as it is drawn once measured, an emoji over two columns and a Chinese character two, as the diff does, so the part of a row shown sideways starts where its text is drawn', () => {
    const wide = {
      char: 10,
      of: (cluster: string) =>
        ({ '✅': 25, 中: 20, 文: 20, '👍🏽': 25 })[cluster] ??
        cluster.length * 10,
    };
    assert.strictEqual(columnsOf('a✅b', wide), 4.5);
    assert.strictEqual(columnsOf('a👍🏽b', wide), 4.5);
    assert.strictEqual(columnsOf(`✅${tab}x`, wide), 5);
    assert.strictEqual(columnAt('a✅b', 2, 0, wide), 3.5);
    assert.deepStrictEqual(shownWithin('中文中文', 0, 4, 2, 6, wide), {
      from: 1,
      to: 3,
      column: 2,
    });
    assert.deepStrictEqual(shownWithin('中文中文', 0, 4, 3, 6, wide), {
      from: 1,
      to: 3,
      column: 2,
    });
  });

  test('keeps to the part of the row a row on screen shows', () => {
    assert.deepStrictEqual(shownWithin('abcdefghij', 2, 8, 0, 4), {
      from: 2,
      to: 6,
      column: 0,
    });
  });
});
