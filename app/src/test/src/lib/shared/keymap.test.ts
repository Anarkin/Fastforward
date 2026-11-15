import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { shellKeymap } from '../../../../shell/shared/keymap';
import {
  clicked,
  bind,
  letterTyped,
  menuFromKeyboard,
  modifierKey,
  pressedAlone,
  pressed,
  pressOfInput,
  released,
  setKeyPlatform,
  shortcutOf,
  wheeled,
  type KeyPress,
} from '../../../../lib/shared/keymap';
import { keyLabels } from '../../../../lib/page/keyLabels';
import { keymap } from '../../../../lib/page/keymap';
import { gitKeymap } from '../../../../tools/git/page/keymap';
import { keyPress, noModifiers, withMacKeys } from '../../../helpers/keys';

const altPress = (key: string, code?: string) =>
  keyPress(key, { altKey: true, ...(code === undefined ? {} : { code }) });

suite('Keymap', () => {
  test('takes the plus, minus and asterisk keys of the number pad and of the keyboard alike, whether Shift types them or not, Alt with them, and shows them as their signs', () => {
    const signs = bind(undefined, 'signs', {
      Plus: 'plus',
      Minus: 'minus',
      Asterisk: 'asterisk',
      'Alt+Plus': 'alt plus',
    } as const);
    const press = (key: string, extra: Partial<KeyPress> = {}) =>
      pressed(signs, keyPress(key, extra), false);

    assert.deepStrictEqual(
      [
        press('+', { code: 'NumpadAdd' }),
        press('+', { code: 'Equal', shiftKey: true }),
        press('-', { code: 'NumpadSubtract' }),
        press('*', { code: 'Digit8', shiftKey: true }),
        press('+', { code: 'NumpadAdd', altKey: true }),
        press('+', { code: 'NumpadAdd', ctrlKey: true }),
        press('=', { code: 'Equal' }),
      ],
      ['plus', 'plus', 'minus', 'asterisk', 'alt plus', undefined, undefined],
    );
    assert.deepStrictEqual(
      [
        keyLabels('Plus', false),
        keyLabels('Minus', false),
        keyLabels('Asterisk', false),
        keyLabels('Alt+Plus', false),
      ],
      [['+'], ['-'], ['*'], ['Alt', '+']],
    );
  });

  test('takes any letter for Letter, by the key pressed when Option types another character on macOS, but no digit nor sign, and tells which letter it was', () => {
    const anyLetter = bind('Folders', 'Filter', { 'Alt+Letter': true });

    assert.strictEqual(pressed(anyLetter, altPress('r'), false), true);
    assert.strictEqual(pressed(anyLetter, altPress('´', 'KeyE'), false), true);
    assert.strictEqual(
      pressed(anyLetter, altPress('1', 'Digit1'), false),
      undefined,
    );
    assert.strictEqual(pressed(anyLetter, keyPress('r'), false), undefined);
    assert.strictEqual(pressed(anyLetter, altPress('r'), true), undefined);
    assert.strictEqual(letterTyped(altPress('R')), 'r');
    assert.strictEqual(letterTyped(altPress('´', 'KeyE')), 'e');
    assert.strictEqual(letterTyped(altPress('1', 'Digit1')), undefined);
    assert.strictEqual(keyLabels('Alt+Letter', false).at(-1), 'A–Z');
  });

  test('takes a letter typed, with Caps Lock on, or on the key of another layout', () => {
    assert.strictEqual(pressed(gitKeymap.head, keyPress('h'), false), true);
    assert.strictEqual(pressed(gitKeymap.head, keyPress('H'), false), true);
    assert.strictEqual(
      pressed(gitKeymap.head, keyPress('р', { code: 'KeyH' }), false),
      true,
    );
    assert.strictEqual(
      pressed(gitKeymap.head, keyPress('h', { code: 'KeyJ' }), false),
      true,
    );
    assert.strictEqual(
      pressed(gitKeymap.head, keyPress('x'), false),
      undefined,
    );
    assert.strictEqual(
      pressed(
        shellKeymap.newTab,
        keyPress('е', { code: 'KeyT', ctrlKey: true }),
        false,
      ),
      true,
    );
  });

  test('takes the letter typed, not the key pressed, on another Latin layout', () => {
    const dvorak = keyPress('u', { code: 'KeyF', ctrlKey: true });
    assert.strictEqual(pressed(gitKeymap.find, dvorak, false), undefined);
    assert.strictEqual(
      pressed(gitKeymap.find, { ...dvorak, key: 'f', code: 'KeyY' }, false),
      true,
    );
    assert.strictEqual(
      pressed(shellKeymap.newTab, { ...dvorak, key: 'y', code: 'KeyT' }, false),
      undefined,
    );
    assert.strictEqual(
      pressed(shellKeymap.newTab, { ...dvorak, key: 't', code: 'KeyK' }, false),
      true,
    );
    assert.strictEqual(
      pressed(gitKeymap.change, keyPress('h', { code: 'KeyJ' }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(gitKeymap.commits, keyPress('j', { code: 'KeyC' }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(gitKeymap.change, keyPress('j', { code: 'KeyC' }), false),
      1,
    );
    assert.strictEqual(
      pressed(gitKeymap.change, keyPress('л', { code: 'KeyK' }), false),
      -1,
    );
  });

  test('takes Mod as Cmd on macOS and Ctrl elsewhere, leaving Ctrl+T and Ctrl+F to the text fields of macOS, but Ctrl only as Ctrl', () => {
    const t = keyPress('t', { code: 'KeyT' });
    try {
      setKeyPlatform('linux');
      assert.strictEqual(
        pressed(shellKeymap.newTab, { ...t, ctrlKey: true }, false),
        true,
      );
      assert.strictEqual(
        pressed(shellKeymap.newTab, { ...t, metaKey: true }, false),
        undefined,
      );
      setKeyPlatform('darwin');
      assert.strictEqual(
        pressed(shellKeymap.newTab, { ...t, metaKey: true }, false),
        true,
      );
      assert.strictEqual(
        pressed(shellKeymap.newTab, { ...t, ctrlKey: true }, true),
        undefined,
      );
      assert.strictEqual(
        clicked(gitKeymap.compare, {
          button: 0,
          ...noModifiers,
          ctrlKey: true,
        }),
        undefined,
      );
    } finally {
      setKeyPlatform('linux');
    }
    assert.strictEqual(pressed(shellKeymap.newTab, t, false), undefined);
    const tab = keyPress('Tab', { ctrlKey: true });
    assert.strictEqual(pressed(shellKeymap.tab, tab, false), 1);
    assert.strictEqual(
      pressed(shellKeymap.tab, { ...tab, shiftKey: true }, false),
      -1,
    );
    assert.strictEqual(
      pressed(
        shellKeymap.tab,
        { ...tab, ctrlKey: false, metaKey: true },
        false,
      ),
      undefined,
    );
  });

  test('tells keys apart by Shift, but for a character that takes Shift to type', () => {
    assert.strictEqual(
      pressed(gitKeymap.head, keyPress('H', { shiftKey: true }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(gitKeymap.folder, keyPress(' ', { shiftKey: true }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(shellKeymap.shortcuts, keyPress('?', { shiftKey: true }), false),
      true,
    );
    assert.strictEqual(
      pressed(shellKeymap.shortcuts, keyPress('F1', { shiftKey: true }), false),
      undefined,
    );
  });

  test('takes no key bound on its own with Ctrl or Cmd held', () => {
    for (const extra of [{ ctrlKey: true }, { metaKey: true }]) {
      assert.strictEqual(
        pressed(gitKeymap.commits, keyPress('c', extra), false),
        undefined,
        JSON.stringify(extra),
      );
    }
  });

  test('takes no key with Alt, nor one handled already or composing text', () => {
    for (const extra of [
      { altKey: true },
      { defaultPrevented: true },
      { isComposing: true },
      { keyCode: 229 },
    ]) {
      assert.strictEqual(
        pressed(gitKeymap.commits, keyPress('c', extra), false),
        undefined,
        JSON.stringify(extra),
      );
    }
  });

  test('takes Alt only for a key bound with it', () => {
    const down = keyPress('ArrowDown');
    const altDown = keyPress('ArrowDown', { altKey: true });
    assert.strictEqual(pressed(gitKeymap.peekStep, altDown, false), 'down');
    assert.strictEqual(pressed(gitKeymap.peekStep, down, false), undefined);
    assert.strictEqual(pressed(keymap.move, altDown, false), undefined);
  });

  test('repeats a step held down, but not an action', () => {
    assert.strictEqual(
      pressed(gitKeymap.change, keyPress('j', { repeat: true }), false),
      1,
    );
    assert.strictEqual(
      pressed(gitKeymap.commits, keyPress('c', { repeat: true }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(
        gitKeymap.parent,
        keyPress('ArrowDown', { ctrlKey: true, repeat: true }),
        false,
      ),
      undefined,
    );
  });

  test('leaves the keys that type or move the caret to a text field, but for those of fields', () => {
    assert.strictEqual(pressed(gitKeymap.head, keyPress('h'), true), undefined);
    assert.strictEqual(
      pressed(shellKeymap.shortcuts, keyPress('?'), true),
      undefined,
    );
    assert.strictEqual(
      pressed(shellKeymap.shortcuts, keyPress('F1'), true),
      true,
    );
    assert.strictEqual(
      pressed(gitKeymap.column, keyPress('ArrowLeft'), true),
      undefined,
    );
    assert.strictEqual(
      pressed(
        gitKeymap.peekStep,
        keyPress('ArrowDown', { altKey: true }),
        true,
      ),
      undefined,
    );
    assert.strictEqual(
      pressed(gitKeymap.parent, keyPress('ArrowDown', { ctrlKey: true }), true),
      undefined,
    );
    assert.strictEqual(
      pressed(
        gitKeymap.worktree,
        keyPress('PageDown', { ctrlKey: true }),
        true,
      ),
      1,
    );
    assert.strictEqual(
      pressed(gitKeymap.column, keyPress('Tab'), true),
      'next',
    );
    assert.strictEqual(
      pressed(gitKeymap.find, keyPress('f', { ctrlKey: true }), true),
      true,
    );
    assert.strictEqual(pressed(keymap.result, keyPress('ArrowDown'), true), 1);
  });

  test('takes clicks of a button and the wheel with their modifiers', () => {
    const click = { button: 0, ...noModifiers };
    assert.strictEqual(clicked(gitKeymap.compare, click), undefined);
    assert.strictEqual(
      clicked(gitKeymap.compare, { ...click, ctrlKey: true }),
      true,
    );
    assert.strictEqual(
      clicked(gitKeymap.compare, { ...click, metaKey: true }),
      undefined,
    );
    assert.strictEqual(clicked(keymap.drag, click), true);
    assert.strictEqual(clicked(shellKeymap.moveTab, click), true);
    assert.strictEqual(
      clicked(shellKeymap.moveTab, { ...click, ctrlKey: true }),
      undefined,
    );
    assert.strictEqual(
      clicked(shellKeymap.moveTab, { ...click, button: 1 }),
      undefined,
    );
    assert.strictEqual(
      clicked(shellKeymap.closeTab, { ...click, button: 1 }),
      true,
    );
    assert.strictEqual(
      clicked(gitKeymap.navigate, { ...click, button: 3 }),
      'back',
    );
    assert.strictEqual(
      clicked(gitKeymap.navigate, { ...click, button: 4 }),
      'forward',
    );
    assert.strictEqual(
      wheeled(gitKeymap.wheelSideways, noModifiers),
      undefined,
    );
    assert.strictEqual(
      wheeled(gitKeymap.wheelSideways, { ...noModifiers, shiftKey: true }),
      true,
    );
  });

  test('tells the keys of a binding done with the pointer from those done on the keyboard, so a hint can name the ones at hand', () => {
    assert.strictEqual(shortcutOf(gitKeymap.pin, 'pointer'), 'Alt+Click');
    assert.strictEqual(shortcutOf(gitKeymap.pin, 'keyboard'), 'Alt+Enter');
    assert.strictEqual(shortcutOf(gitKeymap.message, 'pointer'), 'Alt+Hover');
    assert.strictEqual(shortcutOf(gitKeymap.head, 'pointer'), undefined);
  });

  test('tells a modifier pressed on its own from any other key', () => {
    for (const key of ['Alt', 'AltGraph', 'Control', 'Shift', 'Meta']) {
      assert.ok(modifierKey(keyPress(key)), key);
    }
    for (const key of ['f', 'F', 'ArrowDown', 'Tab', ' ']) {
      assert.ok(!modifierKey(keyPress(key, { altKey: true })), key);
    }
  });

  test('tells a menu opened from the keyboard from one opened by the right button', () => {
    assert.ok(menuFromKeyboard({ button: 0 }));
    assert.ok(!menuFromKeyboard({ button: 2 }));
  });

  test('tells a key pressed alone, or with Shift, from one pressed with Ctrl, Cmd or Alt', () => {
    assert.ok(pressedAlone(noModifiers));
    assert.ok(pressedAlone({ ...noModifiers, shiftKey: true }));
    for (const held of ['ctrlKey', 'metaKey', 'altKey']) {
      assert.ok(!pressedAlone({ ...noModifiers, [held]: true }), held);
    }
  });

  test('ends a drag once no button is held', () => {
    assert.ok(released({ buttons: 0 }));
    assert.ok(!released({ buttons: 1 }));
  });

  test('reads the keys Electron reports before the page sees them, with Cmd for Mod on macOS', () => {
    const input = {
      key: 'I',
      code: 'KeyI',
      control: true,
      meta: false,
      alt: false,
      shift: true,
      isAutoRepeat: false,
    };
    assert.strictEqual(
      pressed(shellKeymap.devTools, pressOfInput(input), false),
      true,
    );
    assert.strictEqual(
      withMacKeys(() =>
        pressed(
          shellKeymap.devTools,
          pressOfInput({ ...input, control: false, meta: true }),
          false,
        ),
      ),
      true,
    );
    assert.strictEqual(
      pressed(
        shellKeymap.devTools,
        pressOfInput({ ...input, shift: false }),
        false,
      ),
      undefined,
    );
  });
});
