import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { shellKeymap } from '../../../../shell/shared/keymap';
import { shortcutOf } from '../../../../lib/shared/keymap';
import { keyLabels, keyParts } from '../../../../shell/page/keyLabels';
import { keymap } from '../../../../lib/page/keymap';
import { strings } from '../../../../lib/shared/strings';
import { gitKeymap } from '../../../../tools/git/page/keymap';
import { withMacKeys } from '../../../helpers/keys';

const parts = (keys: string) =>
  keyParts(keys, false).map(({ label, pointer }) =>
    pointer ? `${label} by mouse` : label,
  );

suite('Key labels', () => {
  test('names Alt held on its own as the key, or Option on macOS', () => {
    assert.deepStrictEqual(keyLabels('Alt', false), ['Alt']);
    assert.deepStrictEqual(keyLabels('Alt', true), ['⌥']);
    assert.strictEqual(shortcutOf(gitKeymap.message, 'keyboard'), 'Alt');
  });

  test('names the keys as the keyboard does, Mod as Ctrl, or Cmd on macOS, and Alt as Option there, on the platform the app runs on unless told', () => {
    assert.deepStrictEqual(keyLabels('Mod+Shift+I', false), [
      'Ctrl',
      'Shift',
      'I',
    ]);
    assert.deepStrictEqual(keyLabels('Mod+T', true), ['⌘', 'T']);
    assert.deepStrictEqual(keyLabels('Ctrl+PageDown', true), ['Ctrl', 'PgDn']);
    assert.deepStrictEqual(keyLabels('ArrowLeft', false), ['←']);
    assert.deepStrictEqual(keyLabels('Alt+ArrowDown', false), ['Alt', '↓']);
    assert.deepStrictEqual(keyLabels('Alt+ArrowDown', true), ['⌥', '↓']);
    assert.deepStrictEqual(keyLabels('Alt+Hover', false), ['Alt', 'Hover']);
    assert.deepStrictEqual(keyLabels('Alt+Hover', true), ['⌥', 'Hover']);
    assert.deepStrictEqual(keyLabels('Alt+Click'), ['Alt', 'Click']);
    assert.deepStrictEqual(
      withMacKeys(() => keyLabels('Alt+Click')),
      ['⌥', 'Click'],
    );
    assert.deepStrictEqual(keyLabels('MiddleClick', false), ['Middle-click']);
    assert.deepStrictEqual(keyLabels('Drag', false), ['Drag']);
  });

  test('tells the part done with the mouse from the keys held with it, so the shortcuts screen marks it, naming the mouse buttons without the word mouse, which the mark says', () => {
    assert.deepStrictEqual(parts('Alt+Click'), ['Alt', 'Click by mouse']);
    assert.deepStrictEqual(parts('Shift+Wheel'), ['Shift', 'Wheel by mouse']);
    assert.deepStrictEqual(parts('Alt+Hover'), ['Alt', 'Hover by mouse']);
    assert.deepStrictEqual(parts('BackButton'), ['Back by mouse']);
    assert.deepStrictEqual(parts('ForwardButton'), ['Forward by mouse']);
    assert.deepStrictEqual(parts('Drag'), ['Drag by mouse']);
    assert.deepStrictEqual(parts('Mod+Shift+T'), ['Ctrl', 'Shift', 'T']);
    assert.deepStrictEqual(parts('Alt'), ['Alt']);
    assert.deepStrictEqual(
      keyParts('Alt+Click', true).map(({ label }) => label),
      ['⌥', 'Click'],
    );
  });

  test('names every key a binding uses from the dictionary, but letters, symbols and F keys, which name themselves, so a translation reaches the shortcuts screen whole', () => {
    const named: Readonly<Record<string, string>> = strings.keys;
    const unnamed = [
      ...Object.values(keymap),
      ...Object.values(shellKeymap),
      ...Object.values(gitKeymap),
    ]
      .flatMap((binding) => Object.keys(binding.keys))
      .map((keys) => keys.split('+').at(-1) ?? keys)
      .filter(
        (key) =>
          key.length > 1 && !/^F\d+$/.test(key) && !Object.hasOwn(named, key),
      );
    assert.deepStrictEqual(unnamed, []);
  });
});
