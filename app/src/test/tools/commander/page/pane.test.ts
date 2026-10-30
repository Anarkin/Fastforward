import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { driveOf } from '../../../../tools/commander/page/pane';
import { shareOf, sideToFocus } from '../../../../tools/commander/page/tool';
import { JSDOM } from 'jsdom';

suite('Commander pane', () => {
  test('shows the drive a folder is on, whatever the case of its letter', () => {
    const drives = ['C:\\', 'D:\\'];
    assert.strictEqual(driveOf('C:\\', drives), 'C:\\');
    assert.strictEqual(driveOf('d:\\backup\\2026', drives), 'D:\\');
    assert.strictEqual(driveOf('\\\\server\\share', drives), undefined);
    assert.strictEqual(driveOf('/home', []), undefined);
  });

  test('focuses the list of the side made active, unless the focus is in that side already, as in its drive menu', () => {
    const { document } = new JSDOM(
      '<section><button class="drive"></button><div data-column-focus tabindex="0"></div></section><button class="elsewhere"></button>',
    ).window;
    const column = document.querySelector('section') ?? undefined;
    const list = document.querySelector('[data-column-focus]');
    assert.strictEqual(
      sideToFocus(column, document.querySelector('.elsewhere')),
      list,
    );
    assert.strictEqual(sideToFocus(column, null), list);
    assert.strictEqual(
      sideToFocus(column, document.querySelector('.drive')),
      undefined,
    );
    assert.strictEqual(sideToFocus(undefined, null), undefined);
  });

  test('splits the sides where the divider is dragged, leaving each some room, and evenly before it is laid out', () => {
    assert.strictEqual(shareOf(300, 1000), 0.3);
    assert.strictEqual(shareOf(10, 1000), 0.15);
    assert.strictEqual(shareOf(990, 1000), 0.85);
    assert.strictEqual(shareOf(10, 0), 0.5);
  });
});
