import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  revealingScroll,
  sidewaysDelta,
  stripOverflows,
  tabsWidth,
} from '../../../../shell/page/tabStrip';

function laidOutTab(left: number, width: number, marginRight = 0) {
  return { offsetLeft: left, offsetWidth: width, marginRight };
}

suite('Tabs too many for one row', () => {
  test('scrolls the tabs sideways by how far the wheel turns either way, as the row has nothing to scroll up or down', () => {
    assert.strictEqual(sidewaysDelta(0, 120), 120);
    assert.strictEqual(sidewaysDelta(0, -120), -120);
    assert.strictEqual(sidewaysDelta(40, 0), 40);
    assert.strictEqual(sidewaysDelta(30, -10), 30);
  });

  test('measures the tabs to the end of the last one’s margin, which takes back the gap before it as it grows or shrinks, so a full row does not flicker between too many and few', () => {
    assert.strictEqual(tabsWidth([]), 0);
    assert.strictEqual(tabsWidth([laidOutTab(48, 80)]), 80);
    assert.strictEqual(
      tabsWidth([
        laidOutTab(48, 80),
        laidOutTab(134, 0, -6),
        laidOutTab(134, 80),
      ]),
      166,
    );
    assert.strictEqual(
      tabsWidth([laidOutTab(48, 80), laidOutTab(134, 12, -6)]),
      92,
    );
  });

  test('takes the tabs for too many once even their narrowest overflow the row, and for few again only once they fit without the room left inside its edges, so it does not flip back and forth', () => {
    const padding = 12;
    assert.strictEqual(stripOverflows(false, 1000, 1000, 0), false);
    assert.strictEqual(stripOverflows(false, 1002, 1000, 0), true);
    assert.strictEqual(stripOverflows(true, 1024, 1000, padding), false);
    assert.strictEqual(stripOverflows(true, 1030, 1000, padding), true);
  });

  test('scrolls the open tab into view by as little as it takes, its curves included, and leaves the row be when it shows already', () => {
    const view = { scrolled: 100, width: 300 };
    const reach = 12;
    assert.strictEqual(
      revealingScroll(view, { start: 150, end: 250 }, reach),
      100,
    );
    assert.strictEqual(
      revealingScroll(view, { start: 50, end: 150 }, reach),
      38,
    );
    assert.strictEqual(
      revealingScroll(view, { start: 380, end: 480 }, reach),
      192,
    );
    assert.strictEqual(revealingScroll(view, { start: 5, end: 105 }, reach), 0);
  });
});
