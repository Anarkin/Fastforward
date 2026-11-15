import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  focusLeaves,
  popupKeyAction,
} from '../../../../../tools/git/page/locationKeys';
import { keyPress } from '../../../../helpers/keys';

const focused = (inside: boolean, menu = false) => ({
  inside,
  closest: (selector: string) =>
    menu && selector === '.context-menu' ? {} : null,
});

suite('Locations search', () => {
  test('leaves Enter and the arrows to an input method composing text', () => {
    const key = keyPress('', { isComposing: false, keyCode: 13 });
    assert.strictEqual(popupKeyAction({ ...key, key: 'Enter' }), 'enter');
    assert.strictEqual(popupKeyAction({ ...key, key: 'ArrowDown' }), 1);
    assert.strictEqual(popupKeyAction({ ...key, key: 'ArrowUp' }), -1);
    assert.strictEqual(
      popupKeyAction(keyPress('Enter', { isComposing: true, keyCode: 13 })),
      undefined,
    );
    assert.strictEqual(
      popupKeyAction(keyPress('Enter', { isComposing: false, keyCode: 229 })),
      undefined,
    );
    assert.strictEqual(
      popupKeyAction(
        keyPress('ArrowDown', { isComposing: true, keyCode: 229 }),
      ),
      undefined,
    );
  });
});

suite('Locations popup', () => {
  test('closes once the focus moves out of it, as Tab moves it to the next column, but not into its context menu, nor when nothing takes it', () => {
    const popup = {
      contains: (target: ReturnType<typeof focused>) => target.inside,
    };
    assert.strictEqual(focusLeaves(popup, focused(false)), true);
    assert.strictEqual(focusLeaves(popup, focused(true)), false);
    assert.strictEqual(focusLeaves(popup, focused(false, true)), false);
    assert.strictEqual(focusLeaves(popup, null), false);
  });
});
