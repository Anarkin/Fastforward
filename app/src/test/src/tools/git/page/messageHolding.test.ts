import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  hiddenLines,
  holdingAfterKey,
  holdingAfterPointer,
  liftOf,
} from '../../../../../tools/git/page/messageHolding';
import { keyPress, noModifiers } from '../../../../helpers/keys';

const alt = { ...noModifiers, altKey: true };
const altDown = keyPress('Alt', { altKey: true });
const altUp = keyPress('Alt');

suite('Message peek', () => {
  test('holds the message open while Alt alone is held, from its key or as the pointer moves with it, and lets it go with Alt', () => {
    assert.strictEqual(holdingAfterKey('none', altDown, true), 'held');
    assert.strictEqual(holdingAfterKey('held', altDown, true), 'held');
    assert.strictEqual(holdingAfterPointer('none', alt), 'held');
    assert.strictEqual(holdingAfterKey('held', altUp, false), 'none');
    assert.strictEqual(holdingAfterPointer('held', noModifiers), 'none');
  });

  test('gives the message up for the rest of the hold once another key is pressed with Alt, such as F for the main menu, until Alt is let go', () => {
    const f = keyPress('f', { altKey: true });
    assert.strictEqual(holdingAfterKey('held', f, true), 'spoiled');
    assert.strictEqual(holdingAfterKey('spoiled', f, false), 'spoiled');
    assert.strictEqual(holdingAfterKey('spoiled', altDown, true), 'spoiled');
    assert.strictEqual(holdingAfterPointer('spoiled', alt), 'spoiled');
    assert.strictEqual(holdingAfterKey('spoiled', altUp, false), 'none');
    assert.strictEqual(holdingAfterKey('none', altDown, true), 'held');
  });

  test('keeps the hold while Alt+↑ or Alt+↓ steps through the commits, held down too', () => {
    for (const key of ['ArrowUp', 'ArrowDown']) {
      assert.strictEqual(
        holdingAfterKey('held', keyPress(key, { altKey: true }), true),
        'held',
        key,
      );
    }
    assert.strictEqual(
      holdingAfterKey(
        'held',
        keyPress('ArrowDown', { altKey: true, repeat: true }),
        true,
      ),
      'held',
    );
    assert.strictEqual(
      holdingAfterKey('held', keyPress('ArrowLeft', { altKey: true }), true),
      'spoiled',
    );
  });

  test('drops the hold while Ctrl, Shift or Cmd is held with Alt, and takes it up again once that is let go', () => {
    const shift = { altKey: true, shiftKey: true };
    assert.strictEqual(
      holdingAfterKey('held', keyPress('Shift', shift), true),
      'none',
    );
    assert.strictEqual(
      holdingAfterPointer('held', { ...alt, ctrlKey: true }),
      'none',
    );
    assert.strictEqual(
      holdingAfterKey('none', keyPress('Shift', { altKey: true }), false),
      'held',
    );
  });

  test('lifts the panel only as far as it runs past the bottom of the list, never above its top', () => {
    const room = { top: 50, bottom: 400 };
    assert.strictEqual(liftOf({ top: 100, bottom: 300 }, room), 0);
    assert.strictEqual(liftOf({ top: 300, bottom: 500 }, room), 100);
    assert.strictEqual(liftOf({ top: 100, bottom: 700 }, room), 50);
    assert.strictEqual(liftOf({ top: 40, bottom: 300 }, room), 0);
  });

  test('counts the lines cut off the rest of a message, a line cut through the middle among them, allowing a pixel of rounding', () => {
    assert.strictEqual(hiddenLines(250, 50, 20), 10);
    assert.strictEqual(hiddenLines(60, 50, 20), 1);
    assert.strictEqual(hiddenLines(51, 50, 20), 0);
    assert.strictEqual(hiddenLines(50, 50, 20), 0);
    assert.strictEqual(hiddenLines(250, 50, Number.NaN), 0);
  });
});
