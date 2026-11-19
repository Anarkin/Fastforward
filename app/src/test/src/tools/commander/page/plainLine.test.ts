import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  nameRoom,
  plainLine,
} from '../../../../../tools/commander/page/plainLine';
import { noFilter, searchFilter } from '../../../../../lib/shared/filter';
import { plainSearch } from '../../../../../lib/shared/searchOptions';

const room = { name: 20, extension: 5, size: 9, date: 16 };

const cells = {
  name: 'notes',
  extension: 'txt',
  size: '12,288',
  date: '2026-11-18 14:05',
};

const filter = (query: string) => searchFilter(query, plainSearch);

suite('Commander rows drawn as one line of text', () => {
  test('writes the name, the extension, the size and the date of a row as one line of text, the name ended by a tab the side stops where the extensions start, the extension filled to its column, the size set to the right of its own and the date last, two characters between them, so the browser lays out and paints one text a row rather than a box for each cell, which took 2.6 ms of every step of a folder of 20,000 files dragged by its scrollbar', () => {
    assert.strictEqual(
      plainLine(cells, room, noFilter),
      'notes\ttxt       12,288  2026-11-18 14:05',
    );
    assert.strictEqual(
      plainLine(
        { name: '[docs]', extension: '', size: '', date: '2026-11-18 14:05' },
        room,
        noFilter,
      ),
      `[docs]\t${' '.repeat(5 + 2 + 9 + 2)}2026-11-18 14:05`,
    );
    assert.strictEqual(
      plainLine(
        { name: '[..]', extension: '', size: '', date: '' },
        room,
        noFilter,
      ),
      '[..]',
    );
  });

  test('writes no line for a row with a cell longer than its column or with a character that may not be one column wide, as a name in Japanese, so its cells go on cutting it where its column ends, nor while the side has not measured how many characters its names have room for', () => {
    assert.deepStrictEqual(
      [
        plainLine({ ...cells, name: 'n'.repeat(20) }, room, noFilter) ===
          undefined,
        plainLine({ ...cells, name: 'n'.repeat(21) }, room, noFilter),
        plainLine({ ...cells, name: '日本' }, room, noFilter),
        plainLine({ ...cells, name: 'a\tb' }, room, noFilter),
        plainLine({ ...cells, extension: 'appinstaller' }, room, noFilter),
        plainLine({ ...cells, size: '1,234,567,890' }, room, noFilter),
        plainLine({ ...cells, date: '18 November 2026 14:05' }, room, noFilter),
        plainLine(cells, { ...room, name: undefined }, noFilter),
      ],
      [
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ],
    );
  });

  test('writes no line for a row the filter of the side marks a word in, in its name or its extension, so the cells go on marking it, and one for a row it marks nothing in', () => {
    assert.deepStrictEqual(
      [
        plainLine(cells, room, filter('not')),
        plainLine(cells, room, filter('tx')),
        plainLine(cells, room, filter('288')) === undefined,
      ],
      [undefined, undefined, false],
    );
  });

  test('counts the characters a name has room for from the width of the name column and the gap between two columns, two characters wide, rounding down, and a width a hair under a whole character as that character, as widths are measured in fractions of a pixel', () => {
    assert.deepStrictEqual(
      [
        nameRoom(210, 14),
        nameRoom(216.9, 14),
        nameRoom(216.999, 14),
        nameRoom(0, 14),
        nameRoom(210, 0),
        nameRoom(210, Number.NaN),
      ],
      [30, 30, 31, 0, undefined, undefined],
    );
  });
});
