import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  rowAt,
  segmentsOfLine,
  windowAround,
} from '../../../../../components/diff/page/cells';

const heights = [20, 40, 20, 100, 20, 20, 60, 20];

const places = heights.map((size, index) => ({
  start: heights.slice(0, index).reduce((sum, each) => sum + each, 0),
  size,
}));

const placeOf = (index: number) => places[index];

suite('Rows of a diff drawn as cells', () => {
  test('finds the row a place down the diff is in from where each row starts, the first for a place above them all and the last for one below', () => {
    assert.deepStrictEqual(
      [-50, 0, 19, 20, 59, 60, 179, 180, 299, 5000].map((offset) =>
        rowAt(places.length, placeOf, offset),
      ),
      [0, 0, 0, 1, 1, 2, 3, 4, 7, 7],
    );
  });

  test('draws what is in sight and a margin above and below it, from a whole line to a whole line and no further than the rows reach, the rows it touches told with it, so a canvas holds whole lines and a scroll within the margin draws nothing anew', () => {
    assert.deepStrictEqual(
      windowAround(places.length, placeOf, 70, 60, 30, 20),
      { first: 1, last: 3, top: 40, bottom: 160 },
    );
    assert.deepStrictEqual(windowAround(places.length, placeOf, 0, 60, 0, 20), {
      first: 0,
      last: 1,
      top: 0,
      bottom: 60,
    });
    assert.deepStrictEqual(
      windowAround(places.length, placeOf, 250, 100, 40, 20),
      { first: 5, last: 7, top: 200, bottom: 300 },
    );
    assert.strictEqual(windowAround(0, placeOf, 0, 60, 30, 20), undefined);
  });

  test('draws only the lines in sight of a row taller than a canvas may be, as a line of a megabyte wraps onto a hundred screens of rows', () => {
    const tall = [
      { start: 0, size: 20 },
      { start: 20, size: 100_000 },
    ];

    assert.deepStrictEqual(
      windowAround(2, (index) => tall[index], 50_000, 600, 300, 20),
      { first: 1, last: 1, top: 49_700, bottom: 50_900 },
    );
  });

  test('cuts a line into the pieces of its colors, the text between two colored pieces a piece of no color, so the cells color a line of a diff as they color a file viewed', () => {
    assert.deepStrictEqual(
      segmentsOfLine('const a = 1;', [
        { start: 0, end: 5, kind: 'keyword' },
        { start: 10, end: 11, kind: 'number' },
      ]),
      [
        { text: 'const', kind: 'keyword' },
        { text: ' a = ' },
        { text: '1', kind: 'number' },
        { text: ';' },
      ],
    );
    assert.deepStrictEqual(segmentsOfLine('plain', []), [{ text: 'plain' }]);
  });
});
