import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  bytesFound,
  hexBytes,
  selectedBytes,
} from '../../../../../tools/viewer/page/byteCopies';

const selected = (from: number, to: number, width = 4) => ({
  anchor: { start: from - (from % width), char: from % width },
  focus: { start: to - (to % width), char: to % width },
});

suite('Copies of the bytes selected in Hex', () => {
  test('reads the bytes a selection seeks from their hex digits, and none from digits that are not whole pairs', () => {
    assert.deepStrictEqual(hexBytes('4D5A00ff'), [0x4d, 0x5a, 0x00, 0xff]);
    assert.deepStrictEqual(
      [hexBytes(''), hexBytes('4D5'), hexBytes('4G')],
      [[], [], []],
    );
  });

  test('finds every copy of the bytes in those held, where they start in the file, a copy overlapping the one before it too, and none of no bytes', () => {
    const data = [0x41, 0x41, 0x41, 0x00, 0x41, 0x41];

    assert.deepStrictEqual(bytesFound(0x100, data, [0x41, 0x41]), [
      { start: 0x100, end: 0x102 },
      { start: 0x101, end: 0x103 },
      { start: 0x104, end: 0x106 },
    ]);
    assert.deepStrictEqual(bytesFound(0, data, [0x00]), [{ start: 3, end: 4 }]);
    assert.deepStrictEqual(bytesFound(0, data, []), []);
  });

  test('takes the bytes a selection of the bytes of a file covers from the bytes read, rows of any width, so their copies are sought by value rather than by the dots drawn for them, and none past what is read or of more than 200 bytes', () => {
    const loaded = { start: 0x100, data: [0x00, 0xf0, 0x9f, 0x41, 0x00, 0xf0] };

    assert.deepStrictEqual(
      selectedBytes(selected(0x101, 0x103), loaded),
      [0xf0, 0x9f],
    );
    assert.deepStrictEqual(
      selectedBytes(selected(0x103, 0x101), loaded),
      [0xf0, 0x9f],
    );
    assert.deepStrictEqual(
      [
        selectedBytes(selected(0x101, 0x101), loaded),
        selectedBytes(selected(0xfe, 0x101), loaded),
        selectedBytes(selected(0x105, 0x107), loaded),
        selectedBytes(selected(0x100, 0x100 + 201), {
          start: 0x100,
          data: Array.from({ length: 300 }, () => 0),
        }),
      ],
      [[], [], [], []],
    );
  });
});
