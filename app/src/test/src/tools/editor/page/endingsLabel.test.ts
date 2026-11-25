import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  endingsLabel,
  endingsTitle,
  linesEnding,
} from '../../../../../tools/editor/page/endingsLabel';

const shown = (crlf: number, lf: number, cr = 0) =>
  ({ ending: 'crlf', counts: { lf, crlf, cr } }) as const;

suite('The line ending button of the editor', () => {
  test('names the one line ending the lines of the file end in, Mixed while they end in more than one, and the ending of new lines for a file with no line break yet', () => {
    assert.deepStrictEqual(
      [
        endingsLabel(shown(3, 0)),
        endingsLabel(shown(3, 1)),
        endingsLabel({ ending: 'lf', counts: { lf: 0, crlf: 0, cr: 0 } }),
      ],
      ['CRLF', 'Mixed', 'LF'],
    );
  });

  test('counts in its tooltip the lines ending in each line ending the file has, LF first, one line said as one, and the ending new lines take', () => {
    assert.deepStrictEqual(
      [endingsTitle(shown(3, 1, 0)), endingsTitle(shown(1, 0, 2))],
      [
        '1 line ends in LF, 3 lines end in CRLF; new lines end in CRLF',
        '1 line ends in CRLF, 2 lines end in CR; new lines end in CRLF',
      ],
    );
  });

  test('takes the ending of the lines of the file only once it has a line break', () => {
    assert.deepStrictEqual(
      [
        linesEnding(shown(1, 0)),
        linesEnding({ ending: 'lf', counts: { lf: 0, crlf: 0, cr: 0 } }),
      ],
      ['crlf', undefined],
    );
  });
});
