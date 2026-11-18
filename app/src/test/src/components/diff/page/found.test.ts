import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { TextWidths } from '../../../../../lib/page/textWidths';
import type { DiffRow } from '../../../../../components/diff/page/rows';
import {
  foundMiddle,
  foundScroll,
} from '../../../../../components/diff/page/found';

const longLine = (kind: 'context' | 'added' | 'removed') => ({
  kind,
  oldNumber: 1,
  newNumber: 1,
  text: 'a'.repeat(400),
});

const foundOn = (line: number) => ({ file: 0, line, start: 300, end: 304 });

const monospace: TextWidths = {
  char: 8,
  of: (cluster) => assert.fail(`measured ${cluster}`),
};

suite('Diff sideways scrolling', () => {
  test('scrolls sideways to a found match hidden past an edge of the side it is on', () => {
    const view = { scrolled: 0, width: 600, room: 3000, minimap: 40 };
    const inline: DiffRow = { kind: 'line', file: 0, line: longLine('added') };
    assert.strictEqual(foundScroll(inline, foundOn(3), view, monospace), 2142);
    const whole: DiffRow = {
      kind: 'wholeLine',
      file: 0,
      number: 4,
      text: 'a'.repeat(400),
    };
    assert.strictEqual(foundScroll(whole, foundOn(3), view, monospace), 2142);
    const changed: DiffRow = {
      kind: 'split',
      file: 0,
      left: { index: 2, line: longLine('removed') },
      right: { index: 3, line: longLine('added') },
    };
    assert.strictEqual(foundScroll(changed, foundOn(2), view, monospace), 2122);
    assert.strictEqual(foundScroll(changed, foundOn(3), view, monospace), 2142);
    const cell = { index: 3, line: longLine('context') };
    const context: DiffRow = {
      kind: 'split',
      file: 0,
      left: cell,
      right: cell,
    };
    assert.strictEqual(foundScroll(context, foundOn(3), view, monospace), 2142);
    assert.strictEqual(
      foundScroll(
        inline,
        { ...foundOn(3), start: 10, end: 14 },
        view,
        monospace,
      ),
      0,
    );
    assert.strictEqual(
      foundScroll(
        inline,
        { ...foundOn(3), start: 0, end: 4 },
        { ...view, scrolled: 2000 },
        monospace,
      ),
      0,
    );
    assert.strictEqual(
      foundScroll({ kind: 'hunk', file: 0 }, foundOn(3), view, monospace),
      undefined,
    );
  });
});

suite('Diff scrolling to a match', () => {
  test('scrolls a wrapped diff to the middle of the match found once it is out of view, or under the stuck header, rather than to the middle of its row, as a line wrapped onto more rows than the view holds kept the match out of it, and leaves a match in view where it is', () => {
    const view = { top: 22, bottom: 400 };
    const row = { top: -1000, start: 5000 };
    assert.strictEqual(
      foundMiddle({ top: 900, bottom: 917 }, view, row),
      6908.5,
    );
    assert.strictEqual(
      foundMiddle({ top: -300, bottom: -283 }, view, row),
      5708.5,
    );
    assert.strictEqual(foundMiddle({ top: 10, bottom: 27 }, view, row), 6018.5);
    assert.strictEqual(
      foundMiddle({ top: 390, bottom: 407 }, view, row),
      6398.5,
    );
    assert.strictEqual(
      foundMiddle({ top: 100, bottom: 117 }, view, row),
      undefined,
    );
  });
});
