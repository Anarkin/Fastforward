import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { codeSegments } from '../../../../../tools/viewer/page/codeSegments';

suite('Code segments', () => {
  test('cuts a code block into the parts each color covers, keeping its lines', () => {
    assert.deepStrictEqual(
      codeSegments('let a = 1\nb', [
        [
          { start: 0, end: 3, kind: 'keyword' },
          { start: 8, end: 9, kind: 'number' },
        ],
        [],
      ]),
      [
        { text: 'let', kind: 'keyword' },
        { text: ' a = ' },
        { text: '1', kind: 'number' },
        { text: '\n' },
        { text: 'b' },
      ],
    );
  });
});
