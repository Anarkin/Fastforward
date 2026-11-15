import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../tools/git/page/diff';
import { diffRows } from '../../../../../tools/git/page/diffRows';
import {
  changeMargin,
  changeScrollTop,
  changeStarts,
  diffScrollTop,
  firstChangeTop,
  keyedScrollTop,
} from '../../../../../tools/git/page/diffScrolling';

suite('Diff keys', () => {
  test('scrolls a line with the arrows, as the terminal, the viewer and the commander do, a screen less a line with the page keys, and to either end', () => {
    assert.strictEqual(diffScrollTop('down', 100, 400, 2000), 122);
    assert.strictEqual(diffScrollTop('up', 40, 400, 2000), 18);
    assert.strictEqual(diffScrollTop('up', 10, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('pageDown', 100, 400, 2000), 478);
    assert.strictEqual(diffScrollTop('pageUp', 500, 400, 2000), 122);
    assert.strictEqual(diffScrollTop('first', 500, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('last', 0, 400, 2000), 1600);
    assert.strictEqual(diffScrollTop('last', 0, 400, 300), 0);
  });

  test('scrolls by lines as tall as those of the diff', () => {
    assert.strictEqual(diffScrollTop('down', 100, 400, 2000, 17), 117);
    assert.strictEqual(diffScrollTop('up', 100, 400, 2000, 17), 83);
    assert.strictEqual(diffScrollTop('pageDown', 100, 400, 2000, 17), 483);
    assert.strictEqual(diffScrollTop('pageUp', 500, 400, 2000, 17), 117);
  });
});

const changeTops = () => [100, 500, 900];

suite('Jumping between changes', () => {
  test('finds where each run of added or removed lines starts', () => {
    const rows = diffRows(
      parsePatch(
        [
          'diff --git a/a.ts b/a.ts',
          '--- a/a.ts',
          '+++ b/a.ts',
          '@@ -1,6 +1,6 @@',
          ' one',
          '-two',
          '+2',
          ' three',
          ' four',
          '+five',
          '',
        ].join('\n'),
      ),
      new Map(),
      undefined,
    );
    assert.deepStrictEqual(
      changeStarts(rows).map((index) => rows[index]),
      [
        {
          kind: 'line',
          file: 0,
          line: {
            kind: 'removed',
            oldNumber: 2,
            newNumber: undefined,
            text: 'two',
          },
        },
        {
          kind: 'line',
          file: 0,
          line: {
            kind: 'added',
            oldNumber: undefined,
            newNumber: 5,
            text: 'five',
          },
        },
      ],
    );
  });

  test('scrolls to the first change below the header and some context, as J would from above it, and nowhere without a change', () => {
    assert.strictEqual(firstChangeTop([100, 500], 60), 40);
    assert.strictEqual(firstChangeTop([30, 500], 60), 0);
    assert.strictEqual(firstChangeTop([], 60), undefined);
  });

  test('scrolls to the next or previous change below the header and some context, and no further at either end', () => {
    const starts = [100, 500, 900];
    assert.strictEqual(changeScrollTop(starts, 0, 1, 60), 40);
    assert.strictEqual(changeScrollTop(starts, 40, 1, 60), 440);
    assert.strictEqual(changeScrollTop(starts, 440, -1, 60), 40);
    assert.strictEqual(changeScrollTop(starts, 40, -1, 60), undefined);
    assert.strictEqual(changeScrollTop(starts, 840, 1, 60), undefined);
    assert.strictEqual(changeScrollTop([30], 100, -1, 60), 0);
  });

  test('jumps to the change after or before where a smooth scroll is headed, as the arrows and page keys move from there too, as J pressed while the view glided went back to a change it had passed', () => {
    const headedTo = 440;
    assert.strictEqual(
      keyedScrollTop(1, undefined, headedTo, 400, 2000, 22, changeTops),
      834,
    );
    assert.strictEqual(
      keyedScrollTop(-1, undefined, headedTo, 400, 2000, 22, changeTops),
      434,
    );
    assert.strictEqual(
      keyedScrollTop(undefined, 'down', headedTo, 400, 2000, 22, changeTops),
      462,
    );
    assert.strictEqual(
      keyedScrollTop(undefined, undefined, headedTo, 400, 2000, 22, changeTops),
      undefined,
    );
  });

  test('leaves room above a change for the file header stuck atop the diff, a line itself, and two lines, however tall the lines', () => {
    assert.strictEqual(changeMargin(22), 66);
    assert.strictEqual(changeMargin(17), 51);
  });
});
