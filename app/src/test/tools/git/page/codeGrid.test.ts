import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { codeSnapOf, textWidths } from '../../../../tools/git/page/diffView';

function measuring(widths: Readonly<Record<string, number>>) {
  return () => ({
    font: '',
    measureText: (text: string) => ({ width: widths[text] ?? 0 }),
  });
}

suite('Code grid', () => {
  test('counts the spacing that puts characters on whole device pixels in the width of each character it measures', () => {
    const widths = textWidths(
      7 + 1 / 3,
      '12px mono',
      2 / 15,
      measuring({ é: 7.2, 漢: 14.4 }),
    );
    assert.strictEqual(widths.of('é'), 7.2 + 2 / 15);
    assert.strictEqual(widths.of('漢'), 14.4 + 2 / 15);
  });

  test('moves the start of code onto the nearest whole device pixel, keeping a side it cannot find where it was', () => {
    const last = { inline: 0.2, left: 0.1, right: -0.3 };
    const snap = codeSnapOf(
      { inline: 683.7, left: undefined, right: 1000.3 },
      1.25,
      last,
    );
    assert.ok(Math.abs((683.7 + snap.inline) * 1.25 - 855) < 1e-9);
    assert.strictEqual(snap.left, 0.1);
    assert.ok(Math.abs((1000.3 + snap.right) * 1.25 - 1250) < 1e-9);
  });
});
