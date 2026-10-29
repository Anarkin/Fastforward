import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  clicked,
  hovered,
  keyLabels,
  keymap,
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
} from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';
import { gitKeymap } from '../../../tools/git/shared/keymap';
import { keyPress, noModifiers, withMacKeys } from '../../fixtures';

const altNavigate = (key: string, inField = false) =>
  pressed(gitKeymap.navigate, keyPress(key, { altKey: true }), inField);

const worktreeStep = (extra: Partial<KeyPress>) =>
  pressed(
    gitKeymap.worktree,
    keyPress('PageDown', { ctrlKey: true, ...extra }),
    false,
  );

function shifted(key: string) {
  return keyPress(key, { shiftKey: true });
}

suite('Keymap', () => {
  test('opens the main menu with Alt+F, or Option+F though it types ƒ, but not with F alone, nor in a text field', () => {
    assert.strictEqual(
      pressed(keymap.mainMenu, keyPress('f', { altKey: true }), false),
      true,
    );
    assert.strictEqual(
      pressed(
        keymap.mainMenu,
        keyPress('ƒ', { code: 'KeyF', altKey: true }),
        false,
      ),
      true,
    );
    assert.strictEqual(
      pressed(keymap.mainMenu, keyPress('f'), false),
      undefined,
    );
    assert.strictEqual(
      pressed(keymap.mainMenu, keyPress('f', { altKey: true }), true),
      undefined,
    );
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
        keymap.newTab,
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
      pressed(keymap.newTab, { ...dvorak, key: 'y', code: 'KeyT' }, false),
      undefined,
    );
    assert.strictEqual(
      pressed(keymap.newTab, { ...dvorak, key: 't', code: 'KeyK' }, false),
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
        pressed(keymap.newTab, { ...t, ctrlKey: true }, false),
        true,
      );
      assert.strictEqual(
        pressed(keymap.newTab, { ...t, metaKey: true }, false),
        undefined,
      );
      setKeyPlatform('darwin');
      assert.strictEqual(
        pressed(keymap.newTab, { ...t, metaKey: true }, false),
        true,
      );
      assert.strictEqual(
        pressed(keymap.newTab, { ...t, ctrlKey: true }, true),
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
    assert.strictEqual(pressed(keymap.newTab, t, false), undefined);
    const tab = keyPress('Tab', { ctrlKey: true });
    assert.strictEqual(pressed(keymap.tab, tab, false), 1);
    assert.strictEqual(
      pressed(keymap.tab, { ...tab, shiftKey: true }, false),
      -1,
    );
    assert.strictEqual(
      pressed(keymap.tab, { ...tab, ctrlKey: false, metaKey: true }, false),
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
      pressed(keymap.shortcuts, keyPress('?', { shiftKey: true }), false),
      true,
    );
    assert.strictEqual(
      pressed(keymap.shortcuts, keyPress('F1', { shiftKey: true }), false),
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

  test('goes to the next worktree on Ctrl+PageDown, and the previous on Ctrl+PageUp', () => {
    assert.strictEqual(worktreeStep({}), 1);
    assert.strictEqual(worktreeStep({ key: 'PageUp' }), -1);
    assert.strictEqual(worktreeStep({ ctrlKey: false }), undefined);
    assert.strictEqual(worktreeStep({ shiftKey: true }), undefined);
    assert.strictEqual(worktreeStep({ altKey: true }), undefined);
    assert.strictEqual(worktreeStep({ metaKey: true }), undefined);
    assert.strictEqual(worktreeStep({ key: 'Tab' }), undefined);
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

  test('steps through the commits with Alt+↑ and Alt+↓, held down too, showing each whole message as Alt stays held', () => {
    assert.strictEqual(
      pressed(gitKeymap.peekStep, keyPress('ArrowUp', { altKey: true }), false),
      'up',
    );
    assert.strictEqual(
      pressed(
        gitKeymap.peekStep,
        keyPress('ArrowDown', { altKey: true, repeat: true }),
        false,
      ),
      'down',
    );
  });

  test('selects the first parent on Ctrl+↓, or Cmd+↓ on macOS, where Ctrl+↓ shows the windows of the app, leaving Alt+↓ to stepping through the commits', () => {
    const modDown = keyPress('ArrowDown', { ctrlKey: true });
    assert.strictEqual(pressed(gitKeymap.parent, modDown, false), true);
    assert.strictEqual(
      withMacKeys(() =>
        pressed(
          gitKeymap.parent,
          keyPress('ArrowDown', { metaKey: true }),
          false,
        ),
      ),
      true,
    );
    assert.strictEqual(
      pressed(gitKeymap.parent, keyPress('ArrowDown', { altKey: true }), false),
      undefined,
    );
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
      pressed(keymap.shortcuts, keyPress('?'), true),
      undefined,
    );
    assert.strictEqual(pressed(keymap.shortcuts, keyPress('F1'), true), true);
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
    assert.strictEqual(clicked(keymap.moveTab, click), true);
    assert.strictEqual(
      clicked(keymap.moveTab, { ...click, ctrlKey: true }),
      undefined,
    );
    assert.strictEqual(
      clicked(keymap.moveTab, { ...click, button: 1 }),
      undefined,
    );
    assert.strictEqual(clicked(keymap.closeTab, { ...click, button: 1 }), true);
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

  test('shows the whole message of a commit hovered with Alt alone, or Option on macOS, but never on a key press', () => {
    const alt = { ...noModifiers, altKey: true };
    assert.strictEqual(hovered(gitKeymap.message, alt), true);
    assert.strictEqual(
      withMacKeys(() => hovered(gitKeymap.message, alt)),
      true,
    );
    assert.strictEqual(hovered(gitKeymap.message, noModifiers), undefined);
    for (const held of ['ctrlKey', 'metaKey', 'shiftKey']) {
      assert.strictEqual(
        hovered(gitKeymap.message, { ...alt, [held]: true }),
        undefined,
        held,
      );
    }
    assert.strictEqual(
      pressed(gitKeymap.message, keyPress('Hover', alt), false),
      undefined,
    );
  });

  test('pins the whole message of a commit on a click with Alt alone, or Option on macOS', () => {
    const click = { button: 0, ...noModifiers, altKey: true };
    assert.strictEqual(clicked(gitKeymap.pin, click), true);
    assert.strictEqual(
      withMacKeys(() => clicked(gitKeymap.pin, click)),
      true,
    );
    assert.strictEqual(
      clicked(gitKeymap.pin, { ...click, altKey: false }),
      undefined,
    );
    assert.strictEqual(
      clicked(gitKeymap.pin, { ...click, shiftKey: true }),
      undefined,
    );
    assert.strictEqual(
      clicked(gitKeymap.pin, { ...click, button: 2 }),
      undefined,
    );
  });

  test('closes the repository on Ctrl+W, or Cmd+W on macOS, as on a middle click on its tab', () => {
    assert.strictEqual(
      pressed(keymap.closeTab, keyPress('w', { ctrlKey: true }), false),
      true,
    );
    assert.strictEqual(
      withMacKeys(() =>
        pressed(keymap.closeTab, keyPress('w', { metaKey: true }), false),
      ),
      true,
    );
    assert.strictEqual(
      clicked(keymap.closeTab, { button: 1, ...noModifiers }),
      true,
    );
    assert.strictEqual(
      pressed(keymap.closeTab, keyPress('w'), false),
      undefined,
    );
  });

  test('opens and closes tabs on Ctrl+Shift+T and Ctrl+Shift+W too, or Cmd+Shift on macOS, even in a field, as a terminal leaves Ctrl+T and Ctrl+W to its shell', () => {
    assert.strictEqual(
      pressed(keymap.newTab, { ...shifted('T'), ctrlKey: true }, true),
      true,
    );
    assert.strictEqual(
      pressed(keymap.closeTab, { ...shifted('W'), ctrlKey: true }, true),
      true,
    );
    assert.strictEqual(
      withMacKeys(() =>
        pressed(keymap.closeTab, { ...shifted('W'), metaKey: true }, true),
      ),
      true,
    );
    assert.strictEqual(pressed(keymap.newTab, shifted('T'), false), undefined);
  });

  test('goes back or forward on Alt+← and Alt+→, as the mouse buttons do, but leaves them to the caret in a field', () => {
    assert.strictEqual(altNavigate('ArrowLeft'), 'back');
    assert.strictEqual(altNavigate('ArrowRight'), 'forward');
    assert.strictEqual(altNavigate('ArrowLeft', true), undefined);
    assert.strictEqual(
      clicked(gitKeymap.navigate, { button: 3, ...noModifiers }),
      'back',
    );
  });

  test('names Alt held on its own as the key, or Option on macOS', () => {
    assert.deepStrictEqual(keyLabels('Alt', false), ['Alt']);
    assert.deepStrictEqual(keyLabels('Alt', true), ['⌥']);
    assert.strictEqual(shortcutOf(gitKeymap.message, 'keyboard'), 'Alt');
  });

  test('tells the keys of a binding done with the pointer from those done on the keyboard, so a hint can name the ones at hand', () => {
    assert.strictEqual(shortcutOf(gitKeymap.pin, 'pointer'), 'Alt+Click');
    assert.strictEqual(shortcutOf(gitKeymap.pin, 'keyboard'), 'Alt+Enter');
    assert.strictEqual(shortcutOf(gitKeymap.message, 'pointer'), 'Alt+Hover');
    assert.strictEqual(shortcutOf(gitKeymap.head, 'pointer'), undefined);
  });

  test('pins the whole message of the selected commit on Alt+Enter, or Option+Enter on macOS, but not on Enter alone', () => {
    const altEnter = keyPress('Enter', { altKey: true });
    assert.strictEqual(pressed(gitKeymap.pin, altEnter, false), true);
    assert.strictEqual(
      withMacKeys(() => pressed(gitKeymap.pin, altEnter, false)),
      true,
    );
    assert.strictEqual(
      pressed(gitKeymap.pin, keyPress('Enter'), false),
      undefined,
    );
    assert.strictEqual(
      pressed(gitKeymap.pin, keyPress('Click', { altKey: true }), false),
      undefined,
    );
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
      pressed(keymap.devTools, pressOfInput(input), false),
      true,
    );
    assert.strictEqual(
      withMacKeys(() =>
        pressed(
          keymap.devTools,
          pressOfInput({ ...input, control: false, meta: true }),
          false,
        ),
      ),
      true,
    );
    assert.strictEqual(
      pressed(keymap.devTools, pressOfInput({ ...input, shift: false }), false),
      undefined,
    );
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

  test('names every key a binding uses from the dictionary, but letters, symbols and F keys, which name themselves, so a translation reaches the shortcuts screen whole', () => {
    const named: Readonly<Record<string, string>> = strings.keys;
    const unnamed = [...Object.values(keymap), ...Object.values(gitKeymap)]
      .flatMap((binding) => Object.keys(binding.keys))
      .map((keys) => keys.split('+').at(-1) ?? keys)
      .filter(
        (key) =>
          key.length > 1 && !/^F\d+$/.test(key) && !Object.hasOwn(named, key),
      );
    assert.deepStrictEqual(unnamed, []);
  });

  test('leaves telling keys, modifiers and buttons apart to itself, so the shortcuts screen lists every one', () => {
    const source = path.join(__dirname, '../../../../src');
    const own = [
      path.join(source, 'shell', 'shared', 'keymap.ts'),
      path.join(source, 'shared', 'strings.ts'),
    ];
    const reads =
      /\b(?:e|ev|\w*[eE]vent|input)\.(?:key|code|button|control|meta|alt|shift)\b|\b\w+\.buttons\b|\b(?:ctrlKey|metaKey|altKey|shiftKey|isComposing|keyCode)\b|'(?:Arrow(?:Up|Down|Left|Right)|Page(?:Up|Down)|Home|End|Enter|Escape|Tab|F\d{1,2})'/;
    const offenders = fs
      .readdirSync(source, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file) && !file.startsWith('test'))
      .map((file) => path.join(source, file))
      .filter((file) => !own.includes(file))
      .flatMap((file) =>
        fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            reads.test(line)
              ? [`${path.relative(source, file)}:${index + 1}: ${line.trim()}`]
              : [],
          ),
      );
    assert.deepStrictEqual(offenders, []);
  });
});
