import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  lineHeightOf,
  measureInLines,
} from '../../../../../tools/git/page/lineHeight';
import { laidOutRow } from '../../../../support/elementFixtures';

const boxOf = (blockSize: number) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  ({ borderBoxSize: [{ blockSize }] }) as unknown as ResizeObserverEntry;

suite('Line height', () => {
  test('measures a row in whole lines on whole device pixels, two lines of 17.6 at 125% at 35.2 rather than the 35 whole CSS pixels a list rounded it to, which moved every row below it off the lines of the list beside it', () => {
    const line = 17.6;
    const measure = measureInLines(line, 1.25);
    assert.strictEqual(measure(laidOutRow(17.6), undefined), line);
    assert.strictEqual(measure(laidOutRow(35.2), undefined), 2 * line);
    assert.strictEqual(measure(laidOutRow(35.19), undefined), 2 * line);
    assert.strictEqual(measure(laidOutRow(0), undefined), 0);
    assert.strictEqual(measure(laidOutRow(0), boxOf(52.8)), 3 * line);
  });

  test('reads the line height of the style on whole device pixels, as the style gives 18.1818 at 110%, which fell half a device pixel short 25,000 lines down', () => {
    const dom = new JSDOM('<div style="line-height: 18.1818px"></div>');
    const element = dom.window.document.querySelector('div');
    const line = lineHeightOf(element, 18, 1.1);
    assert.ok(Math.abs(25_000 * line * 1.1 - 500_000) < 1e-6, String(line));
    assert.strictEqual(lineHeightOf(null, 18, 1.1), 18);
  });
});
